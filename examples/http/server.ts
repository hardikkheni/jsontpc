import { JsonRpcServer, createRouter, procedure } from '@jsontpc/core';
import { HttpServerTransport } from '@jsontpc/http';
import { z } from 'zod';

const router = createRouter({
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
const transport = new HttpServerTransport({ path: '/rpc' });
transport.attach(server);

await transport.listen(3100);
console.log('HTTP JSON-RPC server listening on http://localhost:3100/rpc');
console.log('Press Ctrl+C to stop.');
