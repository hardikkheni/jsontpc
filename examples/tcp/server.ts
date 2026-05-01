/**
 * examples/tcp/server.ts
 *
 * Starts a JSON-RPC TCP server on port 3300 using the default NDJSON framer.
 * Keep this process running while running `client.ts` or `custom-framing.ts`.
 *
 * Run: pnpm --filter jsontpc-examples tcp:server
 */

import { createRouter, JsonRpcServer, procedure } from '@jsontpc/core';
import { TcpServerTransport } from '@jsontpc/tcp';
import { z } from 'zod';

export const router = createRouter({
  add: procedure
    .input(z.object({ a: z.number(), b: z.number() }))
    .output(z.number())
    .handler(({ input }) => input.a + input.b),

  greet: procedure
    .input(z.object({ name: z.string() }))
    .output(z.string())
    .handler(({ input }) => `Hello, ${input.name}!`),

  logEvent: procedure.input(z.object({ name: z.string() })).handler(({ input }) => {
    console.log(`[server] event received: ${input.name}`);
  }),
});

const server = new JsonRpcServer(router);
const transport = new TcpServerTransport();
transport.attach(server);

await transport.listen(3300);
console.log('TCP JSON-RPC server listening on port 3300');
console.log('Press Ctrl+C to stop.');
