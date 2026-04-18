/**
 * examples/core/basic-router.ts
 *
 * Demonstrates the simplest possible jsontpc setup:
 * - Define procedures with `procedure` + `createRouter`
 * - Call `server.handle()` directly (no network transport)
 *
 * Run: pnpm --filter jsontpc-examples core:basic
 */

import { createRouter, JsonRpcServer, procedure } from "@jsontpc/core";

// ---------------------------------------------------------------------------
// Define the router
// ---------------------------------------------------------------------------

const router = createRouter({
  add: procedure.handler(({ input }) => {
    const { a, b } = input as { a: number; b: number };
    return a + b;
  }),

  greet: procedure.handler(({ input }) => {
    const { name } = input as { name: string };
    return `Hello, ${name}!`;
  }),
});

// ---------------------------------------------------------------------------
// Create the server and dispatch requests directly
// ---------------------------------------------------------------------------

const server = new JsonRpcServer(router);

// JSON-RPC 2.0 request
const addResponse = await server.handle({
  jsonrpc: "2.0",
  method: "add",
  params: { a: 10, b: 32 },
  id: 1,
});
console.log("add(10, 32) →", (addResponse as { result: unknown }).result); // 42

// JSON-RPC 1.0 request
const greetResponse = await server.handle({
  method: "greet",
  params: { name: "World" },
  id: 2,
});
console.log("greet('World') →", (greetResponse as { result: unknown }).result); // "Hello, World!"

// Unknown method → METHOD_NOT_FOUND
const errResponse = await server.handle({
  jsonrpc: "2.0",
  method: "nonexistent",
  id: 3,
});
console.log("nonexistent →", (errResponse as { error: { code: number; message: string } }).error);
