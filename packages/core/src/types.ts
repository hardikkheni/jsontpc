// Wire types for JSON-RPC 1.0 and 2.0. No logic, no classes — plain interfaces only.

export type JsonRpcId = string | number | null;
export type JsonRpcParams = unknown[] | Record<string, unknown>;

// ---------------------------------------------------------------------------
// Shared error object shape (used by both 1.0 and 2.0)
// ---------------------------------------------------------------------------

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

// ---------------------------------------------------------------------------
// JSON-RPC 1.0
// ---------------------------------------------------------------------------

export interface JsonRpcRequest1 {
  method: string;
  params: JsonRpcParams;
  id: JsonRpcId;
}

export interface JsonRpcResponse1 {
  result: unknown;
  error: JsonRpcErrorObject | null;
  id: JsonRpcId;
}

// ---------------------------------------------------------------------------
// JSON-RPC 2.0
// ---------------------------------------------------------------------------

export interface JsonRpcRequest2 {
  jsonrpc: "2.0";
  method: string;
  params?: JsonRpcParams;
  /** Absent (undefined) for notifications */
  id?: JsonRpcId;
}

export interface JsonRpcResponse2Ok {
  jsonrpc: "2.0";
  result: unknown;
  id: JsonRpcId;
}

export interface JsonRpcResponse2Err {
  jsonrpc: "2.0";
  error: JsonRpcErrorObject;
  id: JsonRpcId;
}

// ---------------------------------------------------------------------------
// Union aliases
// ---------------------------------------------------------------------------

export type AnyRequest = JsonRpcRequest1 | JsonRpcRequest2;
export type AnyResponse = JsonRpcResponse1 | JsonRpcResponse2Ok | JsonRpcResponse2Err;
export type AnyBatch = AnyRequest[];
