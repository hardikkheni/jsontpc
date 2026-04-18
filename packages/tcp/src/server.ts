import * as net from "node:net";
import { createRequestHandler } from "@jsontpc/core";
import type { IServerTransport, JsonRpcServer } from "@jsontpc/core";
import { NdJsonFramer } from "./framing";
import type { IFramer } from "./framing";

const DEFAULT_MAX_MESSAGE_SIZE = 1_048_576; // 1 MiB

export interface TcpServerTransportOptions {
  /** Framing strategy. Defaults to `NdJsonFramer`. */
  framer?: IFramer;
  /**
   * Maximum allowed byte size per message (accumulated since last complete
   * decoded message). Connections that exceed this limit are destroyed to
   * prevent memory exhaustion (OWASP A06).
   *
   * @default 1_048_576 (1 MiB)
   */
  maxMessageSize?: number;
}

export class TcpServerTransport implements IServerTransport {
  private readonly framer: IFramer;
  private readonly maxMessageSize: number;
  private readonly netServer: net.Server;
  private server: JsonRpcServer | undefined;

  constructor(options: TcpServerTransportOptions = {}) {
    this.framer = options.framer ?? new NdJsonFramer();
    this.maxMessageSize = options.maxMessageSize ?? DEFAULT_MAX_MESSAGE_SIZE;
    this.netServer = net.createServer((socket) => {
      this.handleSocket(socket);
    });
  }

  attach(server: JsonRpcServer): void {
    this.server = server;
  }

  /** Starts listening on the given port. Returns a Promise for async/await convenience. */
  listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.netServer.once("error", reject);
      this.netServer.listen(port, () => {
        this.netServer.removeListener("error", reject);
        resolve();
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.netServer.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private handleSocket(socket: net.Socket): void {
    if (!this.server) {
      socket.destroy(new Error("No server attached — call attach() before listen()"));
      return;
    }

    const handle = createRequestHandler(this.server);
    const decoder = this.framer.createDecoder();
    let pendingBytes = 0;

    socket.on("data", (chunk: Buffer) => {
      pendingBytes += chunk.length;
      if (pendingBytes > this.maxMessageSize) {
        socket.destroy(new Error("Message size limit exceeded"));
        return;
      }
      decoder.write(chunk);
    });

    decoder.on("data", (message: string) => {
      // Reset byte counter once a complete message is decoded.
      pendingBytes = 0;

      void handle(message).then((response) => {
        if (response !== null && !socket.destroyed) {
          socket.write(this.framer.encode(response));
        }
      });
    });

    socket.on("error", () => {
      decoder.destroy();
    });

    socket.on("close", () => {
      decoder.destroy();
    });
  }
}
