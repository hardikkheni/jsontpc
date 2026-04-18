import { ErrorCode, JsonRpcError } from "./errors";
import { isBatch, parseMessage, serializeResponse } from "./protocol";
import type { JsonRpcServer } from "./server";
import type { AnyResponse } from "./types";

// ---------------------------------------------------------------------------
// IFrameworkAdapter — OOP interface
// ---------------------------------------------------------------------------

/**
 * Implement this interface to integrate jsontpc with any HTTP framework.
 *
 * @example
 * class HonoAdapter implements IFrameworkAdapter<HonoContext, HonoContext> {
 *   extractBody(c) { return c.req.text(); }
 *   writeResponse(c, body) {
 *     if (body === null) return c.body(null, 204);
 *     return c.json(JSON.parse(body));
 *   }
 * }
 */
export interface IFrameworkAdapter<TRequest = unknown, TResponse = unknown> {
  /**
   * Extract the raw JSON string from the framework's request object.
   * Implementations should read the raw request body as text.
   */
  extractBody(req: TRequest): string | Promise<string>;

  /**
   * Write the JSON-RPC response back via the framework's response object.
   * `body` is null for notifications and all-notification batches —
   * the adapter should send an empty response (e.g. HTTP 204).
   */
  writeResponse(res: TResponse, body: string | null): void | Promise<void>;
}

// ---------------------------------------------------------------------------
// createRequestHandler — function factory (simplest integration path)
// ---------------------------------------------------------------------------

/**
 * Returns a handler function `(rawBody, context?) => Promise<string | null>`.
 *
 * - Parses the raw JSON body via `parseMessage`
 * - Dispatches via `server.handle()` or `server.handleBatch()`
 * - Serializes the response via `serializeResponse`
 * - Returns `null` for notifications and all-notification batches
 * - Never throws — parse/request errors are serialized as JSON-RPC error responses
 */
export function createRequestHandler(
  server: JsonRpcServer,
): (rawBody: string, context?: unknown) => Promise<string | null> {
  return async (rawBody: string, context?: unknown): Promise<string | null> => {
    let parsed: ReturnType<typeof parseMessage>;
    try {
      parsed = parseMessage(rawBody);
    } catch (err) {
      // parseMessage throws JsonRpcError — serialize as an error response
      const rpcErr =
        err instanceof JsonRpcError ? err : new JsonRpcError("Parse error", ErrorCode.PARSE_ERROR);
      const errResponse: AnyResponse = {
        jsonrpc: "2.0",
        error: { code: rpcErr.code, message: rpcErr.message, data: rpcErr.data },
        id: null,
      };
      return serializeResponse(errResponse);
    }

    if (isBatch(parsed)) {
      const responses = await server.handleBatch(parsed, context);
      if (responses === undefined || responses.length === 0) return null;
      return serializeResponse(responses);
    }

    const response = await server.handle(parsed, context);
    if (response === undefined) return null;
    return serializeResponse(response);
  };
}

// ---------------------------------------------------------------------------
// bindAdapter — wires an IFrameworkAdapter to the handler loop
// ---------------------------------------------------------------------------

/**
 * Wires an `IFrameworkAdapter` implementation to a `JsonRpcServer`.
 * Returns a function `(req, res, context?) => Promise<void>` ready to be
 * registered as a route handler in any framework.
 *
 * Framework adapter packages should use this instead of reimplementing
 * the dispatch loop themselves.
 */
export function bindAdapter<TReq, TRes>(
  server: JsonRpcServer,
  adapter: IFrameworkAdapter<TReq, TRes>,
): (req: TReq, res: TRes, context?: unknown) => Promise<void> {
  const handle = createRequestHandler(server);

  return async (req: TReq, res: TRes, context?: unknown): Promise<void> => {
    const rawBody = await adapter.extractBody(req);
    const responseBody = await handle(rawBody, context);
    await adapter.writeResponse(res, responseBody);
  };
}
