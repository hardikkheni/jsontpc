import * as net from "node:net";
import type { IClientTransport, JsonRpcId } from "@jsontpc/core";
import { NdJsonFramer } from "./framing";
import type { IFramer } from "./framing";

const DEFAULT_MAX_MESSAGE_SIZE = 1_048_576; // 1 MiB

export interface TcpClientTransportOptions {
  host?: string;
  port: number;
  /** Framing strategy. Must match the server's framer. Defaults to `NdJsonFramer`. */
  framer?: IFramer;
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

export class TcpClientTransport implements IClientTransport {
  private readonly host: string;
  private readonly port: number;
  private readonly framer: IFramer;
  private readonly maxMessageSize: number;

  private socket: net.Socket | undefined;
  private readonly pending = new Map<JsonRpcId, PendingEntry>();
  private readonly messageListeners = new Set<(msg: string) => void>();
  private pendingBytes = 0;

  constructor(options: TcpClientTransportOptions) {
    this.host = options.host ?? "127.0.0.1";
    this.port = options.port;
    this.framer = options.framer ?? new NdJsonFramer();
    this.maxMessageSize = options.maxMessageSize ?? DEFAULT_MAX_MESSAGE_SIZE;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      const decoder = this.framer.createDecoder();
      this.socket = socket;
      this.pendingBytes = 0;

      socket.on("data", (chunk: Buffer) => {
        this.pendingBytes += chunk.length;
        if (this.pendingBytes > this.maxMessageSize) {
          socket.destroy(new Error("Incoming message size limit exceeded"));
          return;
        }
        decoder.write(chunk);
      });

      decoder.on("data", (message: string) => {
        this.pendingBytes = 0;
        this.dispatchMessage(message);
      });

      const onError = (err: Error) => {
        this.rejectAll(err);
      };

      socket.on("error", onError);

      socket.on("close", () => {
        const err = new Error("TCP connection closed");
        this.rejectAll(err);
        decoder.destroy();
      });

      socket.connect(this.port, this.host, () => {
        socket.removeListener("error", onError);
        socket.on("error", (err) => {
          this.rejectAll(err);
        });
        resolve();
      });
    });
  }

  send(message: string): Promise<string> {
    if (!this.socket || this.socket.destroyed) {
      return Promise.reject(new Error("Not connected — call connect() first"));
    }

    // Detect notifications: parse the id from the message without a full
    // round-trip through JSON.parse on the hot path.
    let id: JsonRpcId | undefined;
    try {
      const parsed = JSON.parse(message) as Record<string, unknown>;
      // JSON-RPC 2.0: id is absent on notifications; 1.0: id is null.
      id = "id" in parsed ? (parsed.id as JsonRpcId) : undefined;
    } catch {
      // Malformed — still send; the server will return a parse error.
    }

    this.socket.write(this.framer.encode(message));

    // Notifications (id absent or null) are fire-and-forget.
    if (id === undefined || id === null) {
      return Promise.resolve("");
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
      if (!this.socket || this.socket.destroyed) {
        resolve();
        return;
      }
      this.socket.end(resolve);
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
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        id = "id" in parsed ? (parsed.id as JsonRpcId) : undefined;
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
