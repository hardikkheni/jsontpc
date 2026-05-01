import { createClient } from '@jsontpc/core';
import { WsClientTransport } from '@jsontpc/ws';
import type { router } from './server';

async function main() {
  const transport = new WsClientTransport({ url: 'ws://localhost:3400' });

  console.log('🔗 Connecting to WebSocket server...');
  await transport.connect();
  console.log('✓ Connected\n');

  try {
    const client = createClient<typeof router>(transport);

    // Typed RPC calls
    console.log('📤 Making RPC calls...');

    const sum = await client.add({ a: 10, b: 5 });
    console.log(`add(10, 5) = ${sum}`);

    const product = await client.multiply({ a: 3, b: 4 });
    console.log(`multiply(3, 4) = ${product}`);

    const greeting = await client.greet({ name: 'WebSocket' });
    console.log(`greet("WebSocket") = ${greeting}`);

    // Notification (no response expected)
    console.log('\n📨 Sending notification...');
    const notification = JSON.stringify({
      jsonrpc: '2.0',
      method: 'logEvent',
      params: { message: 'User connected via WebSocket' },
    });
    await transport.send(notification);
    console.log('✓ Notification sent (no response)');

    console.log('\n✨ All done!');
  } finally {
    await transport.close();
    console.log('🔌 Connection closed');
  }
}

main().catch(console.error);
