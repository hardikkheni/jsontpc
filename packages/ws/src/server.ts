import { createRequestHandler } from '@jsontpc/core';
import type { IServerTransport, JsonRpcServer } from '@jsontpc/core';
import { type WebSocket, WebSocketServer } from 'ws';

const DEFAULT_MAX_MESSAGE_SIZE = 1_048_576; // 1 MiB

export interface WsServerTransportOptions {
  /**
   * Maximum allowed byte size per message. Connections that exceed this limit
   * are destroyed to prevent memory exhaustion (OWASP A06).
   *
   * @default 1_048_576 (1 MiB)
   */
  maxMessageSize?: number;
  /**
   * WebSocket server options (port, host, etc.) passed to ws.WebSocketServer.
   * If provided, the transport will create and manage the server.
   * If not provided, you must call attach() with a pre-existing server instance.
   */
  port?: number;
  host?: string;
}

export class WsServerTransport implements IServerTransport {
  private readonly maxMessageSize: number;
  private readonly wsServer: WebSocketServer;
  private server: JsonRpcServer | undefined;
  private readonly connectionStates = new Map<WebSocket, { pendingBytes: number }>();

  constructor(options: WsServerTransportOptions = {}) {
    this.maxMessageSize = options.maxMessageSize ?? DEFAULT_MAX_MESSAGE_SIZE;
    this.wsServer = new WebSocketServer({ port: options.port, host: options.host });
    this.wsServer.on('connection', (ws) => {
      this.handleConnection(ws);
    });
  }

  attach(server: JsonRpcServer): void {
    this.server = server;
  }

  /** Starts listening. The server binds to port in the constructor, so this is typically a no-op unless you want to defer server setup. */
  listen(): Promise<void> {
    return Promise.resolve();
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Close all active connections first.
      for (const ws of this.wsServer.clients) {
        ws.close();
      }

      this.wsServer.close((err) => {
        if (err) reject(err);
        else {
          this.connectionStates.clear();
          resolve();
        }
      });
    });
  }

  private handleConnection(ws: WebSocket): void {
    if (!this.server) {
      ws.close(1011, 'No server attached — call attach() before listen()');
      return;
    }

    const handle = createRequestHandler(this.server);
    const state = { pendingBytes: 0 };
    this.connectionStates.set(ws, state);

    ws.on('message', async (data: Buffer | string) => {
      const chunk = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
      state.pendingBytes += chunk.length;

      if (state.pendingBytes > this.maxMessageSize) {
        ws.close(1009, 'Message size limit exceeded');
        this.connectionStates.delete(ws);
        return;
      }

      const message = typeof data === 'string' ? data : data.toString('utf8');
      state.pendingBytes = 0;

      try {
        const response = await handle(message);
        if (response !== null && ws.readyState === 1) {
          // readyState 1 = OPEN
          ws.send(response);
        }
      } catch (err) {
        console.error('Error handling message:', err);
        ws.close(1011, 'Internal server error');
        this.connectionStates.delete(ws);
      }
    });

    ws.on('error', () => {
      this.connectionStates.delete(ws);
    });

    ws.on('close', () => {
      this.connectionStates.delete(ws);
    });
  }
}
