/**
 * examples/core/zod-validation.ts
 *
 * Demonstrates Zod schema validation with jsontpc procedures:
 * - `.input(z.object({...}))` parses and types incoming params
 * - `.output(z.number())` validates the result (dev mode only)
 * - Invalid params produce INVALID_PARAMS (-32602) with `error.data = zodError.issues`
 *
 * Run: pnpm --filter jsontpc-examples core:zod-validation
 */

import { createRouter, JsonRpcServer, procedure } from "@jsontpc/core";
import { z } from "zod";

const router = createRouter({
  multiply: procedure
    .input(z.object({ x: z.number(), y: z.number() }))
    .output(z.number())
    .handler(({ input }) => input.x * input.y),
});

const server = new JsonRpcServer(router);

// ---------------------------------------------------------------------------
// Valid call — params match the schema
// ---------------------------------------------------------------------------

const validResponse = await server.handle({
  jsonrpc: "2.0",
  method: "multiply",
  params: { x: 6, y: 7 },
  id: 1,
});
console.log("multiply(6, 7) →", (validResponse as { result: number }).result); // 42

// ---------------------------------------------------------------------------
// Invalid call — params don't match the schema
// ---------------------------------------------------------------------------

const invalidResponse = await server.handle({
  jsonrpc: "2.0",
  method: "multiply",
  params: { x: "not-a-number", y: 7 },
  id: 2,
});
const err = (invalidResponse as { error: { code: number; data: unknown } }).error;
console.log("multiply('not-a-number', 7) →");
console.log("  error.code:", err.code); // -32602
console.log("  error.data (Zod issues):", JSON.stringify(err.data, null, 2));
