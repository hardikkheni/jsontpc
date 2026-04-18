/**
 * examples/core/batch.ts
 *
 * Demonstrates JSON-RPC batch processing:
 * - `server.handleBatch()` accepts an array of requests
 * - Requests are processed concurrently (Promise.all)
 * - Notifications in the batch are fire-and-forget — excluded from results
 * - Returns undefined when the entire batch consists of notifications
 *
 * Run: pnpm --filter jsontpc-examples core:batch
 */

import { createRouter, JsonRpcServer, procedure } from "@jsontpc/core";
import type { AnyBatch, JsonRpcResponse2Ok } from "@jsontpc/core";

const router = createRouter({
  double: procedure.handler(({ input }) => (input as { n: number }).n * 2),

  logEvent: procedure.handler(({ input }) => {
    console.log("[server] event:", (input as { name: string }).name);
  }),
});

const server = new JsonRpcServer(router);

// ---------------------------------------------------------------------------
// Mixed batch: 2 requests + 1 notification
// ---------------------------------------------------------------------------

const batch: AnyBatch = [
  { jsonrpc: "2.0", method: "double", params: { n: 5 }, id: 1 },
  { jsonrpc: "2.0", method: "double", params: { n: 21 }, id: 2 },
  { jsonrpc: "2.0", method: "logEvent", params: { name: "batch.sent" } }, // notification — no id
];

const responses = await server.handleBatch(batch);

console.log("Batch responses (notifications excluded):");
for (const res of responses ?? []) {
  const r = res as JsonRpcResponse2Ok;
  console.log(`  id=${r.id} result=${r.result}`);
}
// id=1 result=10
// id=2 result=42

// ---------------------------------------------------------------------------
// All-notification batch → returns undefined
// ---------------------------------------------------------------------------

const notificationOnly: AnyBatch = [
  { jsonrpc: "2.0", method: "logEvent", params: { name: "ping" } },
  { jsonrpc: "2.0", method: "logEvent", params: { name: "ping" } },
];

const noResponse = await server.handleBatch(notificationOnly);
console.log("\nAll-notification batch response:", noResponse); // undefined

await new Promise((r) => setTimeout(r, 10));
