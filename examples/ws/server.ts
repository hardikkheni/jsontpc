import { createRouter, procedure, JsonRpcServer } from '@jsontpc/core';
import { WsServerTransport } from '@jsontpc/ws';
import { z } from 'zod';

export const router = createRouter({
  add: procedure
    .input(z.object({ a: z.number(), b: z.number() }))
    .output(z.number())
    .handler(({ input }) => input.a + input.b),

  multiply: procedure
    .input(z.object({ a: z.number(), b: z.number() }))
    .output(z.number())
    .handler(({ input }) => input.a * input.b),

  greet: procedure
    .input(z.object({ name: z.string() }))
    .output(z.string())
    .handler(({ input }) => `Hello, ${input.name}!`),

  logEvent: procedure
    .input(z.object({ message: z.string() }))
    .output(z.void())
    .handler(({ input }) => {
      console.log(`[Event] ${input.message}`);
    }),
});

async function main() {
  const server = new JsonRpcServer(router);
  const transport = new WsServerTransport({ port: 3400 });
  transport.attach(server);

  await transport.listen();
  console.log('🔌 JSON-RPC WebSocket server listening on ws://localhost:3400');
  console.log('Procedures: add, multiply, greet, logEvent');

  // Keep the server running
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await transport.close();
    process.exit(0);
  });
}

main().catch(console.error);
