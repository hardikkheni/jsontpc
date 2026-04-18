import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCode, JsonRpcError } from "../../src/errors";
import type { Router } from "../../src/router";
import { createRouter, procedure } from "../../src/router";
import { JsonRpcServer } from "../../src/server";
import type {
  AnyRequest,
  AnyResponse,
  JsonRpcParams,
  JsonRpcResponse1,
  JsonRpcResponse2Err,
  JsonRpcResponse2Ok,
} from "../../src/types";

// ---------------------------------------------------------------------------
// Test router
// ---------------------------------------------------------------------------

const router = createRouter({
  add: procedure
    .input({ parse: (d: unknown) => d as { a: number; b: number } })
    .handler(({ input }) => input.a + input.b),

  greet: procedure.handler(() => "hello"),

  fail: procedure.handler(() => {
    throw new Error("boom");
  }),

  failRpc: procedure.handler(() => {
    throw new JsonRpcError("Not authorized", -32001, { reason: "expired" });
  }),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeV1Request(method: string, params: unknown, id: number | null = 1): AnyRequest {
  return { method, params: params as JsonRpcParams, id };
}

function makeV2Request(method: string, params: unknown, id: number | null = 1): AnyRequest {
  return { jsonrpc: "2.0", method, params: params as AnyRequest["params"], id };
}

function makeV2Notification(method: string, params?: unknown): AnyRequest {
  return { jsonrpc: "2.0", method, params: params as AnyRequest["params"] };
}

function makeV1Notification(method: string, params: unknown): AnyRequest {
  return { method, params: params as JsonRpcParams, id: null };
}

// ---------------------------------------------------------------------------
// handle() — single request
// ---------------------------------------------------------------------------

describe("JsonRpcServer.handle()", () => {
  let server: JsonRpcServer<typeof router>;

  beforeEach(() => {
    server = new JsonRpcServer(router);
  });

  it("dispatches a JSON-RPC 1.0 request and returns v1 response shape", async () => {
    const res = (await server.handle(makeV1Request("add", { a: 2, b: 3 }))) as JsonRpcResponse1;
    expect(res).toBeDefined();
    expect(res.result).toBe(5);
    expect(res.error).toBeNull();
    expect(res.id).toBe(1);
    expect((res as unknown as Record<string, unknown>).jsonrpc).toBeUndefined();
  });

  it("dispatches a JSON-RPC 2.0 request and returns v2 response shape", async () => {
    const res = (await server.handle(makeV2Request("greet", {}))) as JsonRpcResponse2Ok;
    expect(res).toBeDefined();
    expect(res.jsonrpc).toBe("2.0");
    expect(res.result).toBe("hello");
    expect(res.id).toBe(1);
    expect((res as unknown as Record<string, unknown>).error).toBeUndefined();
  });

  it("returns undefined for a JSON-RPC 2.0 notification", async () => {
    const res = await server.handle(makeV2Notification("greet"));
    expect(res).toBeUndefined();
  });

  it("returns undefined for a JSON-RPC 1.0 notification (id === null)", async () => {
    const res = await server.handle(makeV1Notification("greet", {}));
    expect(res).toBeUndefined();
  });

  it("returns METHOD_NOT_FOUND (-32601) for unknown method", async () => {
    const res = (await server.handle(makeV2Request("unknown", {}))) as JsonRpcResponse2Err;
    expect(res.error.code).toBe(ErrorCode.METHOD_NOT_FOUND);
  });

  it("returns INVALID_PARAMS (-32602) with issues when Zod-like schema fails", async () => {
    const zodLikeRouter = createRouter({
      validated: procedure
        .input({
          parse(data: unknown) {
            if (typeof (data as { n?: unknown }).n !== "number") {
              const err = Object.assign(new Error("Invalid"), {
                issues: [{ path: ["n"], message: "Expected number" }],
              });
              throw err;
            }
            return data as { n: number };
          },
        })
        .handler(({ input }) => input.n),
    });
    const s = new JsonRpcServer(zodLikeRouter);
    const res = (await s.handle(makeV2Request("validated", { n: "oops" }))) as JsonRpcResponse2Err;
    expect(res.error.code).toBe(ErrorCode.INVALID_PARAMS);
    expect(Array.isArray(res.error.data)).toBe(true);
  });

  it("passes through a JsonRpcError thrown from a handler", async () => {
    const res = (await server.handle(makeV2Request("failRpc", {}))) as JsonRpcResponse2Err;
    expect(res.error.code).toBe(-32001);
    expect(res.error.message).toBe("Not authorized");
    expect((res.error.data as Record<string, unknown>).reason).toBe("expired");
  });

  it("wraps a raw Error into INTERNAL_ERROR (-32603) in dev mode", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    const res = (await server.handle(makeV2Request("fail", {}))) as JsonRpcResponse2Err;
    process.env.NODE_ENV = originalEnv;
    expect(res.error.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect((res.error.data as Record<string, unknown>).cause).toBe("boom");
  });

  it("suppresses error data in production mode", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const res = (await server.handle(makeV2Request("fail", {}))) as JsonRpcResponse2Err;
    process.env.NODE_ENV = originalEnv;
    expect(res.error.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(res.error.data).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// handleBatch()
// ---------------------------------------------------------------------------

describe("JsonRpcServer.handleBatch()", () => {
  let server: JsonRpcServer<typeof router>;

  beforeEach(() => {
    server = new JsonRpcServer(router);
  });

  it("processes non-notification requests and returns responses", async () => {
    const requests = [makeV2Request("add", { a: 1, b: 2 }, 1), makeV2Request("greet", {}, 2)];
    const responses = (await server.handleBatch(requests)) as AnyResponse[];
    expect(responses).toHaveLength(2);
    expect((responses[0] as JsonRpcResponse2Ok).result).toBe(3);
    expect((responses[1] as JsonRpcResponse2Ok).result).toBe("hello");
  });

  it("returns undefined when all requests are notifications", async () => {
    const requests = [makeV2Notification("greet"), makeV2Notification("greet")];
    const result = await server.handleBatch(requests);
    expect(result).toBeUndefined();
  });

  it("excludes notification responses from the result array", async () => {
    const requests = [
      makeV2Request("add", { a: 1, b: 1 }, 1),
      makeV2Notification("greet"), // should not appear in result
    ];
    const responses = (await server.handleBatch(requests)) as AnyResponse[];
    expect(responses).toHaveLength(1);
    expect((responses[0] as JsonRpcResponse2Ok).id).toBe(1);
  });

  it("processes requests concurrently (all resolve)", async () => {
    const timedRouter = createRouter({
      slow: procedure.handler(
        () => new Promise<string>((resolve) => setTimeout(() => resolve("done"), 10)),
      ),
    } satisfies Router);
    const s = new JsonRpcServer(timedRouter);
    const requests = [
      makeV2Request("slow", {}, 1),
      makeV2Request("slow", {}, 2),
      makeV2Request("slow", {}, 3),
    ];
    const start = Date.now();
    const responses = await s.handleBatch(requests);
    const elapsed = Date.now() - start;
    // Concurrent: should finish well under 3×10 ms
    expect(elapsed).toBeLessThan(100);
    expect(responses).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Output validation warning (dev mode)
// ---------------------------------------------------------------------------

describe("output schema validation (dev mode)", () => {
  it("logs a warning but still returns the result when output is invalid", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.NODE_ENV = "development";

    const badOutputRouter = createRouter({
      bad: procedure
        .output({
          parse(v: unknown) {
            if (typeof v !== "number") throw new Error("expected number");
            return v as number;
          },
        })
        .handler(() => "not-a-number" as unknown as number),
    });
    const s = new JsonRpcServer(badOutputRouter);
    const res = (await s.handle(makeV2Request("bad", {}, 1))) as JsonRpcResponse2Ok;

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(res.result).toBe("not-a-number");

    warnSpy.mockRestore();
    process.env.NODE_ENV = "test";
  });
});
