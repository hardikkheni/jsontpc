import { ErrorCode, JsonRpcError } from "./errors.js";
import { detectVersion, isNotification, serializeResponse } from "./protocol.js";
import type { Router } from "./router.js";
import type {
  AnyBatch,
  AnyRequest,
  AnyResponse,
  JsonRpcErrorObject,
  JsonRpcRequest2,
  JsonRpcResponse1,
  JsonRpcResponse2Err,
  JsonRpcResponse2Ok,
} from "./types.js";

// ---------------------------------------------------------------------------
// Transport interface (implemented by each @jsontpc/* transport package)
// ---------------------------------------------------------------------------

export interface IServerTransport {
  /** Wire the server's handle() to incoming messages from this transport. */
  attach(server: JsonRpcServer): void;
  listen(port: number): void;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isZodError(err: unknown): err is { issues: unknown[] } {
  return (
    typeof err === "object" && err !== null && Array.isArray((err as { issues?: unknown }).issues)
  );
}

function toRpcError(err: unknown): JsonRpcError {
  if (err instanceof JsonRpcError) return err;
  const message = err instanceof Error ? err.message : "An internal error occurred";
  const data = process.env.NODE_ENV !== "production" ? { cause: message } : undefined;
  return new JsonRpcError("Internal error", ErrorCode.INTERNAL_ERROR, data);
}

function buildResponse(
  version: 1 | 2,
  id: AnyRequest["id"],
  result: unknown,
  error: JsonRpcErrorObject | null,
): AnyResponse {
  if (version === 2) {
    const id2 = (id ?? null) as JsonRpcResponse2Ok["id"];
    if (error !== null) {
      return {
        jsonrpc: "2.0",
        error,
        id: id2,
      } satisfies JsonRpcResponse2Err;
    }
    return {
      jsonrpc: "2.0",
      result,
      id: id2,
    } satisfies JsonRpcResponse2Ok;
  }
  // JSON-RPC 1.0
  return {
    result: error !== null ? null : result,
    error,
    id: id ?? null,
  } satisfies JsonRpcResponse1;
}

// ---------------------------------------------------------------------------
// JsonRpcServer
// ---------------------------------------------------------------------------

export class JsonRpcServer<TRouter extends Router = Router> {
  constructor(private readonly router: TRouter) {}

  /**
   * Dispatch a single parsed request.
   * Returns undefined for notifications (no response should be sent).
   */
  async handle(req: AnyRequest, context?: unknown): Promise<AnyResponse | undefined> {
    const version = detectVersion(req);
    const id = (req as JsonRpcRequest2).id ?? req.id;

    if (isNotification(req)) {
      // Fire-and-forget: run handler, swallow any error
      void this.dispatch(req, context).catch(() => undefined);
      return undefined;
    }

    let result: unknown;
    let errorObj: JsonRpcErrorObject | null = null;

    try {
      result = await this.dispatch(req, context);
    } catch (err) {
      const rpcErr = toRpcError(err);
      errorObj = { code: rpcErr.code, message: rpcErr.message, data: rpcErr.data };
    }

    return buildResponse(version, id, result, errorObj);
  }

  /**
   * Dispatch a batch of parsed requests.
   * Returns undefined if all requests were notifications.
   */
  async handleBatch(requests: AnyBatch, context?: unknown): Promise<AnyResponse[] | undefined> {
    const notifications = requests.filter(isNotification);
    const nonNotifications = requests.filter((r) => !isNotification(r));

    // Fire-and-forget all notifications
    for (const n of notifications) {
      void this.dispatch(n, context).catch(() => undefined);
    }

    if (nonNotifications.length === 0) return undefined;

    const responses = await Promise.all(nonNotifications.map((r) => this.handle(r, context)));

    // Filter out any undefined (should not happen for non-notifications, but be safe)
    return responses.filter((r): r is AnyResponse => r !== undefined);
  }

  // ---------------------------------------------------------------------------
  // Private dispatch
  // ---------------------------------------------------------------------------

  private async dispatch(req: AnyRequest, context: unknown): Promise<unknown> {
    const procedure = this.router[req.method];
    if (!procedure) {
      throw new JsonRpcError(`Method not found: ${req.method}`, ErrorCode.METHOD_NOT_FOUND);
    }

    const rawParams =
      (req as JsonRpcRequest2).params ?? (req as { params?: unknown }).params ?? null;
    let input: unknown = rawParams;

    if (procedure.inputSchema) {
      try {
        input = procedure.inputSchema.parse(rawParams);
      } catch (err) {
        if (isZodError(err)) {
          throw new JsonRpcError("Invalid params", ErrorCode.INVALID_PARAMS, err.issues);
        }
        throw new JsonRpcError("Invalid params", ErrorCode.INVALID_PARAMS);
      }
    }

    const result = await procedure.handler({ input, context });

    // Output validation is a developer-experience aid — dev mode only, never throws
    if (procedure.outputSchema && process.env.NODE_ENV !== "production") {
      try {
        procedure.outputSchema.parse(result);
      } catch (err) {
        // Log the warning but do not throw — the response is still sent
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[jsontpc] Output validation warning for "${req.method}": ${msg}`);
      }
    }

    return result;
  }
}

// ---------------------------------------------------------------------------
// Re-export for convenience — callers can import server + serializeResponse
// from the same place
// ---------------------------------------------------------------------------
export { serializeResponse };
