import { type IFrameworkAdapter, type JsonRpcServer, bindAdapter } from '@jsontpc/core';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

const DEFAULT_MAX_MESSAGE_SIZE = 1_048_576; // 1 MiB

export interface JsonRpcExpressOptions {
  /** Max request body in bytes. Default: 1 MiB. Enforced only on raw-stream path (no express.json()). */
  maxMessageSize?: number;
}

class ExpressAdapter implements IFrameworkAdapter<Request, Response> {
  constructor(private readonly maxMessageSize: number) {}

  async extractBody(req: Request): Promise<string> {
    // express.json() already parsed — re-serialize to raw JSON string
    if (req.body !== undefined) {
      return typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }
    return readBody(req, this.maxMessageSize);
  }

  writeResponse(res: Response, body: string | null): void {
    if (body === null) {
      res.status(204).end();
      return;
    }
    res.status(200).type('application/json').end(body);
  }
}

function readBody(req: Request, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let tooLarge = false;

    req.on('data', (chunk: Buffer) => {
      if (tooLarge) return;
      totalBytes += chunk.length;
      if (totalBytes > maxSize) {
        tooLarge = true;
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
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

/**
 * Returns an Express `RequestHandler` that dispatches JSON-RPC requests to the given server.
 *
 * Mount on a POST route: `app.post('/rpc', jsonRpcExpress(server))`
 *
 * Works with or without `express.json()` upstream. When `express.json()` is not used,
 * the raw body is read directly with the configured `maxMessageSize` guard.
 */
export function jsonRpcExpress(
  server: JsonRpcServer,
  options: JsonRpcExpressOptions = {},
): RequestHandler {
  const maxMessageSize = options.maxMessageSize ?? DEFAULT_MAX_MESSAGE_SIZE;
  const adapter = new ExpressAdapter(maxMessageSize);
  const handler = bindAdapter(server, adapter);

  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch((err: unknown) => {
      if (err instanceof Error && (err as { status?: number }).status === 413) {
        res.status(413).end();
        return;
      }
      next(err);
    });
  };
}
