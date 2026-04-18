import { describe, expect, it } from "vitest";
import { ErrorCode, JsonRpcError } from "../../src/errors.js";
import {
  detectVersion,
  isBatch,
  isNotification,
  parseMessage,
  serializeResponse,
} from "../../src/protocol.js";
import type { AnyResponse, JsonRpcResponse2Ok } from "../../src/types.js";

// ---------------------------------------------------------------------------
// parseMessage
// ---------------------------------------------------------------------------

describe("parseMessage", () => {
  it("parses a valid JSON-RPC 1.0 request", () => {
    const msg = JSON.stringify({ method: "add", params: [1, 2], id: 1 });
    const result = parseMessage(msg);
    expect(result).toMatchObject({ method: "add", params: [1, 2], id: 1 });
  });

  it("parses a valid JSON-RPC 2.0 request", () => {
    const msg = JSON.stringify({
      jsonrpc: "2.0",
      method: "greet",
      params: { name: "Alice" },
      id: 2,
    });
    const result = parseMessage(msg);
    expect(result).toMatchObject({ jsonrpc: "2.0", method: "greet", id: 2 });
  });

  it("parses a valid JSON-RPC 2.0 notification (no id)", () => {
    const msg = JSON.stringify({ jsonrpc: "2.0", method: "notify" });
    const result = parseMessage(msg);
    expect(result).toMatchObject({ jsonrpc: "2.0", method: "notify" });
    expect((result as unknown as Record<string, unknown>).id).toBeUndefined();
  });

  it("parses a valid batch", () => {
    const msg = JSON.stringify([
      { jsonrpc: "2.0", method: "add", params: [1, 2], id: 1 },
      { jsonrpc: "2.0", method: "sub", params: [5, 3], id: 2 },
    ]);
    const result = parseMessage(msg);
    expect(Array.isArray(result)).toBe(true);
    expect((result as unknown[]).length).toBe(2);
  });

  it("throws PARSE_ERROR on invalid JSON", () => {
    expect.assertions(2);
    try {
      parseMessage("not-json{{{");
    } catch (err) {
      expect(err).toBeInstanceOf(JsonRpcError);
      expect((err as JsonRpcError).code).toBe(ErrorCode.PARSE_ERROR);
    }
  });

  it("throws INVALID_REQUEST when top-level is not an object", () => {
    expect.assertions(2);
    try {
      parseMessage('"just a string"');
    } catch (err) {
      expect(err).toBeInstanceOf(JsonRpcError);
      expect((err as JsonRpcError).code).toBe(ErrorCode.INVALID_REQUEST);
    }
  });

  it("throws INVALID_REQUEST when method is missing", () => {
    expect.assertions(2);
    try {
      parseMessage(JSON.stringify({ id: 1 }));
    } catch (err) {
      expect(err).toBeInstanceOf(JsonRpcError);
      expect((err as JsonRpcError).code).toBe(ErrorCode.INVALID_REQUEST);
    }
  });

  it("throws INVALID_REQUEST on empty batch array", () => {
    expect.assertions(2);
    try {
      parseMessage("[]");
    } catch (err) {
      expect(err).toBeInstanceOf(JsonRpcError);
      expect((err as JsonRpcError).code).toBe(ErrorCode.INVALID_REQUEST);
    }
  });
});

// ---------------------------------------------------------------------------
// detectVersion
// ---------------------------------------------------------------------------

describe("detectVersion", () => {
  it("returns 2 for jsonrpc: '2.0'", () => {
    const req = { jsonrpc: "2.0" as const, method: "x", id: 1 };
    expect(detectVersion(req)).toBe(2);
  });

  it("returns 1 when jsonrpc field is absent (1.0)", () => {
    const req = { method: "x", params: [], id: 1 };
    expect(detectVersion(req)).toBe(1);
  });

  it("returns 1 for jsonrpc: '1.0'", () => {
    const req = { jsonrpc: "1.0" as unknown, method: "x", params: [], id: 1 };
    expect(detectVersion(req as Parameters<typeof detectVersion>[0])).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// serializeResponse
// ---------------------------------------------------------------------------

describe("serializeResponse", () => {
  it("round-trips a single response", () => {
    const res: AnyResponse = { jsonrpc: "2.0", result: 42, id: 1 };
    const serialized = serializeResponse(res);
    expect(JSON.parse(serialized)).toEqual(res);
  });

  it("serializes a batch array of responses", () => {
    const responses: AnyResponse[] = [
      { jsonrpc: "2.0", result: 1, id: 1 },
      { jsonrpc: "2.0", result: 2, id: 2 },
    ];
    const serialized = serializeResponse(responses);
    expect(JSON.parse(serialized)).toEqual(responses);
  });

  it("never throws", () => {
    const res: JsonRpcResponse2Ok = { jsonrpc: "2.0", result: undefined, id: null };
    expect(() => serializeResponse(res)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// isNotification
// ---------------------------------------------------------------------------

describe("isNotification", () => {
  it("returns true for JSON-RPC 1.0 with id === null", () => {
    expect(isNotification({ method: "ping", params: [], id: null })).toBe(true);
  });

  it("returns false for JSON-RPC 1.0 with a non-null id", () => {
    expect(isNotification({ method: "ping", params: [], id: 1 })).toBe(false);
  });

  it("returns true for JSON-RPC 2.0 with no id property", () => {
    expect(isNotification({ jsonrpc: "2.0" as const, method: "ping" })).toBe(true);
  });

  it("returns false for JSON-RPC 2.0 with an explicit id", () => {
    expect(isNotification({ jsonrpc: "2.0" as const, method: "ping", id: 1 })).toBe(false);
  });

  it("returns false for JSON-RPC 2.0 with id === null (not a notification)", () => {
    // id: null in v2 means the id is explicitly null (e.g. when the request id couldn't be parsed)
    // However per RFC, a notification has NO id property — so id: null is still a request
    expect(isNotification({ jsonrpc: "2.0" as const, method: "ping", id: null })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isBatch
// ---------------------------------------------------------------------------

describe("isBatch", () => {
  it("returns true for a non-empty array", () => {
    expect(isBatch([{ method: "x", params: [], id: 1 }])).toBe(true);
  });

  it("returns false for an empty array", () => {
    expect(isBatch([])).toBe(false);
  });

  it("returns false for an object", () => {
    expect(isBatch({ method: "x" })).toBe(false);
  });

  it("returns false for null", () => {
    expect(isBatch(null)).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isBatch("hello")).toBe(false);
  });
});
