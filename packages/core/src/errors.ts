// Standard JSON-RPC error codes and the JsonRpcError class.

// eslint-disable-next-line no-shadow
export enum ErrorCode {
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,
}

export class JsonRpcError extends Error {
  override readonly name = "JsonRpcError";

  constructor(
    message: string,
    public readonly code: number,
    public readonly data?: unknown,
  ) {
    super(message);
    // Maintain correct prototype chain when transpiled to ES5
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
