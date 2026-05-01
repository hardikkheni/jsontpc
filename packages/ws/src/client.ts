import type { IClientTransport, JsonRpcId } from '@jsontpc/core';
import { WebSocket } from 'ws';

const DEFAULT_MAX_MESSAGE_SIZE = 1_048_576; // 1 MiB

export interface WsClientTransportOptions {
  /** WebSocket server URL (e.g., 'ws://localhost:3400') */
  url: string;
  /**
   * Maximum allowed byte size for a single incoming message.
   * The connection is destroyed if this limit is exceeded.
   *
   * @default 1_048_576 (1 MiB)
   */
  maxMessageSize?: number;
}

type PendingEntry = {
  resolve: (value: string) => void;
  reject: (reason: Error) => void;
};

export class WsClientTransport implements IClientTransport {
  private readonly url: string;
  private readonly maxMessageSize: number;

  private ws: WebSocket | undefined;
  private readonly pending = new Map<JsonRpcId, PendingEntry>();
  private readonly messageListeners = new Set<(msg: string) => void>();
  private pendingBytes = 0;

  constructor(options: WsClientTransportOptions) {
    this.url = options.url;
    this.maxMessageSize = options.maxMessageSize ?? DEFAULT_MAX_MESSAGE_SIZE;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(this.url);
        this.ws = ws;
        this.pendingBytes = 0;

        const onError = (err: Error) => {
          this.rejectAll(err);
        };

        ws.on('error', onError);

        ws.on('open', () => {
          ws.removeListener('error', onError);
          ws.on('error', (err) => {
            this.rejectAll(err);
          });
          resolve();
        });

        ws.on('message', (data: Buffer | string) => {
          const chunk = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
          this.pendingBytes += chunk.length;

          if (this.pendingBytes > this.maxMessageSize) {
            ws.close(1009, 'Incoming message size limit exceeded');
            return;
          }

          const message = typeof data === 'string' ? data : data.toString('utf8');
          this.pendingBytes = 0;

          this.dispatchMessage(message);
        });

        ws.on('close', () => {
          const err = new Error('WebSocket connection closed');
          this.rejectAll(err);
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  send(message: string): Promise<string> {
    if (!this.ws || this.ws.readyState !== 1) {
      // readyState 1 = OPEN
      return Promise.reject(new Error('Not connected — call connect() first'));
    }

    // Detect notifications: parse the id from the message.
    let id: JsonRpcId | undefined;
    try {
      const parsed = JSON.parse(message) as Record<string, unknown>;
      // JSON-RPC 2.0: id is absent on notifications; 1.0: id is null.
      id = 'id' in parsed ? (parsed.id as JsonRpcId) : undefined;
    } catch {
      // Malformed — still send; the server will return a parse error.
    }

    this.ws.send(message);

    // Notifications (id absent or null) are fire-and-forget.
    if (id === undefined || id === null) {
      return Promise.resolve('');
    }

    return new Promise<string>((resolve, reject) => {
      this.pending.set(id as JsonRpcId, { resolve, reject });
    });
  }

  onMessage(handler: (msg: string) => void): void {
    this.messageListeners.add(handler);
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.ws || this.ws.readyState !== 1) {
        resolve();
        return;
      }
      this.ws.close();
      this.ws.once('close', resolve);
    });
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private dispatchMessage(message: string): void {
    let id: JsonRpcId | undefined;
    try {
      const parsed = JSON.parse(message) as Record<string, unknown>;
      // Batch responses are arrays — no top-level id.
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        id = 'id' in parsed ? (parsed.id as JsonRpcId) : undefined;
      }
    } catch {
      // Unparseable — fall through to message listeners.
    }

    if (id !== undefined && id !== null && this.pending.has(id)) {
      this.pending.get(id)?.resolve(message);
      this.pending.delete(id);
      return;
    }

    // Batch responses or unsolicited messages — forward to listeners.
    for (const listener of this.messageListeners) {
      listener(message);
    }
  }

  private rejectAll(err: Error): void {
    for (const { reject } of this.pending.values()) {
      reject(err);
    }
    this.pending.clear();
  }
}
