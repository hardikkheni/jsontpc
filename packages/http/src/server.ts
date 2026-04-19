import * as http from 'node:http';
import { createRequestHandler } from '@jsontpc/core';
import type { IServerTransport, JsonRpcServer } from '@jsontpc/core';

const DEFAULT_MAX_MESSAGE_SIZE = 1_048_576; // 1 MiB

export interface HttpServerTransportOptions {
  /** The URL path to listen on. Default: `'/'` */
  path?: string;
  /** Maximum allowed request body size in bytes. Default: 1 MiB */
  maxMessageSize?: number;
}

export class HttpServerTransport implements IServerTransport {
  private readonly path: string;
  private readonly maxMessageSize: number;
  private readonly httpServer: http.Server;
  private server: JsonRpcServer | undefined;

  constructor(options: HttpServerTransportOptions = {}) {
    this.path = options.path ?? '/';
    this.maxMessageSize = options.maxMessageSize ?? DEFAULT_MAX_MESSAGE_SIZE;
    this.httpServer = http.createServer((req, res) => {
      void this.handleRequest(req, res);
    });
  }

  attach(server: JsonRpcServer): void {
    this.server = server;
  }

  listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer.once('error', reject);
      this.httpServer.listen(port, () => {
        this.httpServer.removeListener('error', reject);
        resolve();
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Only accept POST to the configured path
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST' });
      res.end();
      return;
    }

    if (req.url !== this.path) {
      res.writeHead(404);
      res.end();
      return;
    }

    if (!this.server) {
      res.writeHead(503);
      res.end();
      return;
    }

    // Accumulate body with maxMessageSize guard
    let rawBody: string;
    try {
      rawBody = await this.readBody(req);
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        // Drain remaining body so the socket stays clean, then respond 413
        req.resume();
        res.writeHead(413);
        res.end();
        return;
      }
      res.writeHead(400);
      res.end();
      return;
    }

    const handle = createRequestHandler(this.server);
    const responseBody = await handle(rawBody);

    if (responseBody === null) {
      // Notification or all-notification batch — no response body
      res.writeHead(204);
      res.end();
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(responseBody);
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      let tooLarge = false;

      req.on('data', (chunk: Buffer) => {
        if (tooLarge) return; // keep draining, don't accumulate
        totalBytes += chunk.length;
        if (totalBytes > this.maxMessageSize) {
          tooLarge = true;
          reject(new PayloadTooLargeError());
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        if (!tooLarge) resolve(Buffer.concat(chunks).toString('utf8'));
      });

      req.on('error', reject);
    });
  }
}

class PayloadTooLargeError extends Error {
  constructor() {
    super('Payload too large');
  }
}
