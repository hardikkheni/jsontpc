import { createClient, createRouter, procedure } from '@jsontpc/core';
import { HttpClientTransport } from '@jsontpc/http';
import { z } from 'zod';

// Mirror the router definition so createClient can infer types
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

const transport = new HttpClientTransport('http://localhost:3100/rpc');
const client = createClient<typeof router>(transport);

const sum = await client.add({ a: 20, b: 22 });
console.log('add(20, 22) →', sum); // 42

const greeting = await client.greet({ name: 'jsontpc' });
console.log("greet('jsontpc') →", greeting);

// Send a notification (no id — fire-and-forget, server responds 204)
const notifResponse = await fetch('http://localhost:3100/rpc', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'logEvent',
    params: { name: 'client.done' },
  }),
});
console.log('logEvent notification sent, status:', notifResponse.status); // 204

console.log('Done.');
