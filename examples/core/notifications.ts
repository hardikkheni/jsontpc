/**
 * examples/core/notifications.ts
 *
 * Demonstrates JSON-RPC notifications (fire-and-forget):
 * - JSON-RPC 2.0: omit the `id` field entirely
 * - JSON-RPC 1.0: set `id` to null
 * - `server.handle()` returns undefined — no response is sent
 *
 * Run: pnpm --filter jsontpc-examples core:notifications
 */

import { createRouter, JsonRpcServer, procedure } from "@jsontpc/core";

const log: string[] = [];

const router = createRouter({
  logEvent: procedure.handler(({ input }) => {
    const { event } = input as { event: string };
    log.push(event);
    console.log(`[server] Received event: ${event}`);
  }),
});

const server = new JsonRpcServer(router);

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 notification (no `id` property)
// ---------------------------------------------------------------------------

const v2Result = await server.handle({
  jsonrpc: "2.0",
  method: "logEvent",
  params: { event: "user.login" },
  // no `id` — this is a notification
});
console.log("v2 notification response:", v2Result); // undefined

// Give the fire-and-forget handler time to complete
await new Promise((r) => setTimeout(r, 10));

// ---------------------------------------------------------------------------
// JSON-RPC 1.0 notification (id === null)
// ---------------------------------------------------------------------------

const v1Result = await server.handle({
  method: "logEvent",
  params: { event: "user.logout" },
  id: null, // JSON-RPC 1.0 notification
});
console.log("v1 notification response:", v1Result); // undefined

await new Promise((r) => setTimeout(r, 10));

console.log("Events logged on server:", log);
