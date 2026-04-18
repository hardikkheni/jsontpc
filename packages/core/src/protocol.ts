import { ErrorCode, JsonRpcError } from "./errors";
import type { AnyBatch, AnyRequest, AnyResponse, JsonRpcRequest2 } from "./types";

// ---------------------------------------------------------------------------
// Version detection
// ---------------------------------------------------------------------------

export function detectVersion(raw: AnyRequest): 1 | 2 {
  return (raw as JsonRpcRequest2).jsonrpc === "2.0" ? 2 : 1;
}

// ---------------------------------------------------------------------------
// Notification detection
// ---------------------------------------------------------------------------

export function isNotification(req: AnyRequest): boolean {
  if ((req as JsonRpcRequest2).jsonrpc === "2.0") {
    // JSON-RPC 2.0: notification has no `id` property at all (undefined)
    return !Object.prototype.hasOwnProperty.call(req, "id");
  }
  // JSON-RPC 1.0: notification has id === null
  return req.id === null;
}

// ---------------------------------------------------------------------------
// Batch detection
// ---------------------------------------------------------------------------

export function isBatch(parsed: unknown): parsed is AnyBatch {
  return Array.isArray(parsed) && parsed.length > 0;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function validateRequest(raw: unknown): AnyRequest {
  if (
    typeof raw !== "object" ||
    raw === null ||
    typeof (raw as Record<string, unknown>).method !== "string"
  ) {
    throw new JsonRpcError("Invalid Request", ErrorCode.INVALID_REQUEST);
  }
  return raw as AnyRequest;
}

export function parseMessage(raw: string): AnyRequest | AnyBatch {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new JsonRpcError("Parse error", ErrorCode.PARSE_ERROR);
  }

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      throw new JsonRpcError("Invalid Request", ErrorCode.INVALID_REQUEST);
    }
    // Validate each item in the batch
    return parsed.map(validateRequest);
  }

  return validateRequest(parsed);
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export function serializeResponse(res: AnyResponse | AnyResponse[]): string {
  return JSON.stringify(res);
}
