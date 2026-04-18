import { describe, expect, it, vi } from "vitest";
import type { ProcedureDef } from "../../src/router.js";
import { createRouter, procedure } from "../../src/router.js";

// ---------------------------------------------------------------------------
// ProcedureBuilder
// ---------------------------------------------------------------------------

describe("procedure builder", () => {
  it("creates a ProcedureDef with only a handler", () => {
    const fn = () => 42;
    const def = procedure.handler(fn);
    expect(def.handler).toBe(fn);
    expect(def.inputSchema).toBeUndefined();
    expect(def.outputSchema).toBeUndefined();
  });

  it("attaches an inputSchema when .input() is used", () => {
    const schema = { parse: (d: unknown) => d as number };
    const def = procedure.input(schema).handler(() => 0);
    expect(def.inputSchema).toBe(schema);
    expect(def.outputSchema).toBeUndefined();
  });

  it("attaches both schemas when .input().output() is used", () => {
    const inputSchema = { parse: (d: unknown) => d as number };
    const outputSchema = { parse: (d: unknown) => d as string };
    const def = procedure
      .input(inputSchema)
      .output(outputSchema)
      .handler(() => "ok");
    expect(def.inputSchema).toBe(inputSchema);
    expect(def.outputSchema).toBe(outputSchema);
  });

  it("is immutable — calling .input() returns a new builder", () => {
    const original = procedure;
    const withInput = original.input({ parse: (d: unknown) => d });
    expect(withInput).not.toBe(original);
  });

  it("passes HandlerContext to the handler at runtime", async () => {
    const spy = vi.fn(({ input }: { input: number }) => input * 2);
    const def = procedure.input({ parse: (d: unknown) => d as number }).handler(spy);
    await def.handler({ input: 5, context: { user: "alice" } });
    expect(spy).toHaveBeenCalledWith({ input: 5, context: { user: "alice" } });
  });
});

// ---------------------------------------------------------------------------
// createRouter
// ---------------------------------------------------------------------------

describe("createRouter", () => {
  it("returns the exact same object (identity function)", () => {
    const handlers = {
      ping: procedure.handler(() => "pong"),
    };
    const router = createRouter(handlers);
    expect(router).toBe(handlers);
  });

  it("preserves all procedure definitions", () => {
    const pingDef: ProcedureDef<unknown, string> = procedure.handler(() => "pong");
    const addDef: ProcedureDef<{ a: number; b: number }, number> = procedure
      .input({ parse: (d: unknown) => d as { a: number; b: number } })
      .handler(({ input }) => input.a + input.b);

    const router = createRouter({ ping: pingDef, add: addDef });
    expect(router.ping).toBe(pingDef);
    expect(router.add).toBe(addDef);
  });

  it("accepts an empty router", () => {
    const router = createRouter({});
    expect(Object.keys(router)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Type inference helpers (compile-time tests via expect<Type>)
// These verify that the inference helpers produce the correct TypeScript types.
// ---------------------------------------------------------------------------

describe("type inference helpers (structural)", () => {
  it("inferred input type flows into handler ctx", async () => {
    const def = procedure
      .input({ parse: (d: unknown) => d as { name: string } })
      .handler(({ input }) => input.name.toUpperCase());

    const result = await def.handler({ input: { name: "alice" }, context: undefined });
    expect(result).toBe("ALICE");
  });

  it("inferred output type is the handler return type", async () => {
    const def = procedure.handler(async () => 99 as number);
    const result = await def.handler({ input: undefined, context: undefined });
    expect(result).toBe(99);
  });
});
