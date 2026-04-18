import { describe, expect, it, vi } from "vitest";
import { type IFrameworkAdapter, bindAdapter, createRequestHandler } from "../../src/adapter.js";
import { ErrorCode } from "../../src/errors.js";
import { createRouter, procedure } from "../../src/router.js";
import { JsonRpcServer } from "../../src/server.js";

// ---------------------------------------------------------------------------
// Shared test router
// ---------------------------------------------------------------------------

const router = createRouter({
  add: procedure.handler(({ input }) => {
    const params = input as { a: number; b: number };
    return params.a + params.b;
  }),
});

function makeServer() {
  return new JsonRpcServer(router);
}

// ---------------------------------------------------------------------------
// createRequestHandler
// ---------------------------------------------------------------------------

describe("createRequestHandler", () => {
  it("handles a valid request and returns a serialized response string", async () => {
    const handle = createRequestHandler(makeServer());
    const raw = JSON.stringify({ jsonrpc: "2.0", method: "add", params: { a: 3, b: 4 }, id: 1 });
    const result = await handle(raw);
    expect(typeof result).toBe("string");
    const parsed = JSON.parse(result as string) as { result: number };
  });

  it("returns null for a notification (no response needed)", async () => {
    const handle = createRequestHandler(makeServer());
    const raw = JSON.stringify({ jsonrpc: "2.0", method: "add", params: { a: 1, b: 1 } });
    const result = await handle(raw);
    expect(result).toBeNull();
  });

  it("returns a serialized batch response for a batch request", async () => {
    const handle = createRequestHandler(makeServer());
    const raw = JSON.stringify([
      { jsonrpc: "2.0", method: "add", params: { a: 1, b: 2 }, id: 1 },
      { jsonrpc: "2.0", method: "add", params: { a: 3, b: 4 }, id: 2 },
    ]);
    const result = await handle(raw);
    expect(typeof result).toBe("string");
    const parsed = JSON.parse(result as string) as { result: number }[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
  });

  it("returns null when batch contains only notifications", async () => {
    const handle = createRequestHandler(makeServer());
    const raw = JSON.stringify([{ jsonrpc: "2.0", method: "add", params: { a: 1, b: 1 } }]);
    const result = await handle(raw);
    expect(result).toBeNull();
  });

  it("returns a serialized PARSE_ERROR response instead of throwing on invalid JSON", async () => {
    const handle = createRequestHandler(makeServer());
    const result = await handle("not-valid-json{");
    expect(typeof result).toBe("string");
    const parsed = JSON.parse(result as string) as { error: { code: number } };
    expect(parsed.error.code).toBe(ErrorCode.PARSE_ERROR);
  });

  it("returns a serialized INVALID_REQUEST response instead of throwing on bad shape", async () => {
    const handle = createRequestHandler(makeServer());
    const result = await handle('"just a string"');
    expect(typeof result).toBe("string");
    const parsed = JSON.parse(result as string) as { error: { code: number } };
    expect(parsed.error.code).toBe(ErrorCode.INVALID_REQUEST);
  });
});

// ---------------------------------------------------------------------------
// bindAdapter
// ---------------------------------------------------------------------------

describe("bindAdapter", () => {
  it("calls extractBody and writeResponse with the correct arguments", async () => {
    const mockAdapter: IFrameworkAdapter<{ body: string }, { written: string | null }> = {
      extractBody: vi.fn((req) => req.body),
      writeResponse: vi.fn((_res, body) => {
        _res.written = body;
      }),
    };

    const handler = bindAdapter(makeServer(), mockAdapter);
    const req = {
      body: JSON.stringify({ jsonrpc: "2.0", method: "add", params: { a: 1, b: 2 }, id: 1 }),
    };
    const res = { written: null as string | null };

    await handler(req, res);

    expect(mockAdapter.extractBody).toHaveBeenCalledWith(req);
    expect(mockAdapter.writeResponse).toHaveBeenCalledOnce();
    const body = (mockAdapter.writeResponse as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    const parsed = JSON.parse(body) as { result: number };
    expect(parsed.result).toBe(3);
  });

  it("calls writeResponse with null for a notification", async () => {
    const writeResponse = vi.fn();
    const mockAdapter: IFrameworkAdapter<{ body: string }, undefined> = {
      extractBody: (req) => req.body,
      writeResponse,
    };

    const handler = bindAdapter(makeServer(), mockAdapter);
    const req = { body: JSON.stringify({ jsonrpc: "2.0", method: "add", params: { a: 1, b: 1 } }) };

    await handler(req, undefined);
    expect(writeResponse).toHaveBeenCalledWith(undefined, null);
  });

  it("passes context to the underlying server", async () => {
    let capturedContext: unknown;
    const contextRouter = createRouter({
      ctx: procedure.handler(({ context }) => {
        capturedContext = context;
        return "ok";
      }),
    });
    const s = new JsonRpcServer(contextRouter);

    const mockAdapter: IFrameworkAdapter<{ body: string }, undefined> = {
      extractBody: (req) => req.body,
      writeResponse: vi.fn(),
    };

    const handler = bindAdapter(s, mockAdapter);
    const req = { body: JSON.stringify({ jsonrpc: "2.0", method: "ctx", id: 1 }) };
    const ctx = { userId: 42 };

    await handler(req, undefined, ctx);
    expect(capturedContext).toEqual(ctx);
  });
});
