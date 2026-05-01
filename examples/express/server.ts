import { JsonRpcServer, createRouter, procedure } from '@jsontpc/core';
import { jsonRpcExpress } from '@jsontpc/express';
import express from 'express';
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
const app = express();

app.post('/rpc', jsonRpcExpress(server));

app.listen(3300, () => {
  console.log('Express JSON-RPC server listening on http://localhost:3300/rpc');
  console.log('Press Ctrl+C to stop.');
});
