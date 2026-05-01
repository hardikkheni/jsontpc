import { ErrorCode, JsonRpcServer, createClient, createRouter, procedure } from '@jsontpc/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WsClientTransport, WsServerTransport } from '../../src';

describe('WebSocket Transport', () => {
  let serverTransport: WsServerTransport;
  let clientTransport: WsClientTransport;
  let server: JsonRpcServer;
  let client: ReturnType<typeof createClient>;

  const router = createRouter({
    add: procedure.handler(({ input }: { input: unknown }) => {
      const p = input as { a: number; b: number };
      return p.a + p.b;
    }),

    greet: procedure.handler(({ input }: { input: unknown }) => {
      const p = input as { name: string };
      return `Hello, ${p.name}!`;
    }),

    logEvent: procedure.handler(() => {
      // Side effect: this handler runs for notifications too
    }),

    divide: procedure.handler(({ input }: { input: unknown }) => {
      const p = input as { a: number; b: number };
      if (p.b === 0) throw new Error('Division by zero');
      return p.a / p.b;
    }),
  });

  beforeEach(async () => {
    server = new JsonRpcServer(router);
    serverTransport = new WsServerTransport({ port: 3400 });
    serverTransport.attach(server);
    await serverTransport.listen();

    clientTransport = new WsClientTransport({ url: 'ws://localhost:3400' });
    await clientTransport.connect();

    client = createClient(clientTransport);
  });

  afterEach(async () => {
    await clientTransport.close();
    await serverTransport.close();
  });

  describe('Basic RPC calls', () => {
    it('should handle typed procedure calls', async () => {
      const result = await client.add({ a: 10, b: 5 });
      expect(result).toBe(15);
    });

    it('should handle multiple concurrent calls', async () => {
      const promise1 = client.add({ a: 1, b: 2 });
      const promise2 = client.greet({ name: 'Alice' });
      const promise3 = client.add({ a: 3, b: 4 });

      const [r1, r2, r3] = await Promise.all([promise1, promise2, promise3]);
      expect(r1).toBe(3);
      expect(r2).toBe('Hello, Alice!');
      expect(r3).toBe(7);
    });

    it('should handle JSON-RPC 2.0 requests', async () => {
      const request = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'add',
        params: { a: 5, b: 3 },
      });

      const response = await clientTransport.send(request);
      const parsed = JSON.parse(response);

      expect(parsed.jsonrpc).toBe('2.0');
      expect(parsed.id).toBe(1);
      expect(parsed.result).toBe(8);
    });

    it('should handle JSON-RPC 1.0 requests', async () => {
      const request = JSON.stringify({
        id: 42,
        method: 'add',
        params: { a: 2, b: 3 },
      });

      const response = await clientTransport.send(request);
      const parsed = JSON.parse(response);

      expect(parsed.id).toBe(42);
      expect(parsed.result).toBe(5);
    });
  });

  describe('Notifications', () => {
    it('should handle notifications (no id)', async () => {
      const notification = JSON.stringify({
        jsonrpc: '2.0',
        method: 'logEvent',
        params: { message: 'test event' },
      });

      const response = await clientTransport.send(notification);
      expect(response).toBe('');
    });

    it('should handle null id as notification (JSON-RPC 1.0 style)', async () => {
      const notification = JSON.stringify({
        id: null,
        method: 'logEvent',
        params: { message: 'test' },
      });

      const response = await clientTransport.send(notification);
      expect(response).toBe('');
    });
  });

  describe('Batch requests', () => {
    it('should handle batch requests', async () => {
      const batch = JSON.stringify([
        { jsonrpc: '2.0', id: 1, method: 'add', params: { a: 1, b: 1 } },
        { jsonrpc: '2.0', id: 2, method: 'add', params: { a: 2, b: 2 } },
        { jsonrpc: '2.0', id: 3, method: 'greet', params: { name: 'Bob' } },
      ]);

      // Batch responses arrive as a single JSON array message.
      const responsePromise = new Promise<string>((resolve) => {
        clientTransport.onMessage(resolve);
      });

      await clientTransport.send(batch); // Resolves immediately with ''
      const responseRaw = await responsePromise;
      const responses = JSON.parse(responseRaw);

      expect(Array.isArray(responses)).toBe(true);
      expect(responses).toHaveLength(3);
      expect(responses[0].result).toBe(2);
      expect(responses[1].result).toBe(4);
      expect(responses[2].result).toBe('Hello, Bob!');
    });
  });

  describe('Error handling', () => {
    it('should return -32601 (METHOD_NOT_FOUND) for unknown methods', async () => {
      const request = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'unknownMethod',
        params: {},
      });

      const response = await clientTransport.send(request);
      const parsed = JSON.parse(response);

      expect(parsed.error.code).toBe(ErrorCode.METHOD_NOT_FOUND);
    });

    it('should return -32603 (INTERNAL_ERROR) for handler exceptions', async () => {
      const request = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'divide',
        params: { a: 10, b: 0 },
      });

      const response = await clientTransport.send(request);
      const parsed = JSON.parse(response);

      expect(parsed.error.code).toBe(ErrorCode.INTERNAL_ERROR);
    });

    it('should handle connection errors gracefully', async () => {
      await clientTransport.close();

      const promise = clientTransport.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'add',
          params: { a: 1, b: 2 },
        }),
      );

      await expect(promise).rejects.toThrow();
    });
  });

  describe('Connection lifecycle', () => {
    it('should fail to send before connect()', async () => {
      const newTransport = new WsClientTransport({ url: 'ws://localhost:3400' });

      const promise = newTransport.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'add',
          params: { a: 1, b: 2 },
        }),
      );

      await expect(promise).rejects.toThrow('Not connected');
    });

    it('should handle multiple close() calls gracefully', async () => {
      await clientTransport.close();
      await clientTransport.close(); // Should not throw
    });
  });

  describe('Message size limits', () => {
    it('should enforce maxMessageSize', async () => {
      const smallTransport = new WsClientTransport({
        url: 'ws://localhost:3400',
        maxMessageSize: 100, // Very small limit
      });

      await smallTransport.connect();

      const largeMessage = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'greet',
        params: { name: 'A'.repeat(1000) }, // Oversized payload
      });

      await expect(smallTransport.send(largeMessage)).rejects.toThrow();
      await smallTransport.close();
    });
  });

  describe('Server-initiated messages', () => {
    it('should handle unsolicited server messages via onMessage', async () => {
      const messages: string[] = [];

      clientTransport.onMessage((msg: string) => {
        messages.push(msg);
      });

      // Send a batch request that returns multiple responses
      const batch = JSON.stringify([
        { jsonrpc: '2.0', id: 1, method: 'add', params: { a: 1, b: 1 } },
        { jsonrpc: '2.0', id: 2, method: 'add', params: { a: 2, b: 2 } },
      ]);

      await clientTransport.send(batch);

      // Wait a bit for the batch to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      // The batch response should have been dispatched to onMessage
      // since it's an array (no top-level id)
      expect(messages.length).toBeGreaterThan(0);
    });
  });
});
