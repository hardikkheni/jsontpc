/**
 * examples/tcp/client.ts
 *
 * Connects to the TCP JSON-RPC server started by `server.ts` and makes a few
 * typed RPC calls, then disconnects cleanly.
 *
 * Run (after starting server.ts in another terminal):
 *   pnpm --filter jsontpc-examples tcp:client
 */

import { createClient, createRouter, procedure } from "@jsontpc/core";
import { TcpClientTransport } from "@jsontpc/tcp";
import { z } from "zod";

// Mirror the server-side router (schemas must match) so createClient infers
// fully typed call signatures — no casts needed at call sites.
const router = createRouter({
  add: procedure
    .input(z.object({ a: z.number(), b: z.number() }))
    .output(z.number())
    .handler(({ input }) => input.a + input.b),

  greet: procedure
    .input(z.object({ name: z.string() }))
    .output(z.string())
    .handler(({ input }) => `Hello, ${input.name}!`),

  logEvent: procedure.input(z.object({ name: z.string() })).handler(({ input }) => input.name),
});

const transport = new TcpClientTransport({ port: 3300 });
await transport.connect();
console.log("Connected to TCP server on port 3300");

const client = createClient<typeof router>(transport);

// Call: add
const sum = await client.add({ a: 20, b: 22 });
console.log("add(20, 22) →", sum); // 42

// Call: greet
const greeting = await client.greet({ name: "jsontpc" });
console.log("greet('jsontpc') →", greeting); // Hello, jsontpc!

// Notification: logEvent (fire-and-forget — no response)
const raw = JSON.stringify({ jsonrpc: "2.0", method: "logEvent", params: { name: "client.done" } });
await transport.send(raw);
console.log("logEvent notification sent (no response expected)");

await transport.close();
console.log("Disconnected.");
