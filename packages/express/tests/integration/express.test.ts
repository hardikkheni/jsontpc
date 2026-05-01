import type * as http from 'node:http';
import { JsonRpcServer, createClient, createRouter, procedure } from '@jsontpc/core';
import type { AnyBatch, AnyResponse, JsonRpcResponse2Err, JsonRpcResponse2Ok } from '@jsontpc/core';
import { HttpClientTransport } from '@jsontpc/http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { jsonRpcExpress } from '../../src';

// ---------------------------------------------------------------------------
// Shared router
// ---------------------------------------------------------------------------

const events: string[] = [];

const router = createRouter({
  add: procedure.handler(({ input }) => {
    const { a, b } = input as { a: number; b: number };
    return a + b;
  }),

  greet: procedure.handler(({ input }) => {
    const { name } = input as { name: string };
    return `Hello, ${name}!`;
  }),

  logEvent: procedure.handler(({ input }) => {
    const { name } = input as { name: string };
    events.push(name);
  }),
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('jsonRpcExpress middleware', () => {
  const PORT = 3220;
  const BASE_URL = `http://127.0.0.1:${PORT}/rpc`;

  let httpServer: http.Server;
  let clientTransport: HttpClientTransport;
  let typedClient: ReturnType<typeof createClient<typeof router>>;

  beforeAll(async () => {
    const app = express();
    app.post('/rpc', jsonRpcExpress(new JsonRpcServer(router)));

    httpServer = app.listen(PORT);
    await new Promise<void>((resolve) => httpServer.once('listening', resolve));

    clientTransport = new HttpClientTransport(BASE_URL);
    typedClient = createClient<typeof router>(clientTransport);
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // -------------------------------------------------------------------------
  // 1. Basic typed proxy calls
  // -------------------------------------------------------------------------

  it('add — typed proxy call', async () => {
    const result = await typedClient.add({ a: 10, b: 32 });
    expect(result).toBe(42);
  });

  it('greet — typed proxy call', async () => {
    const result = await typedClient.greet({ name: 'World' });
    expect(result).toBe('Hello, World!');
  });

  // -------------------------------------------------------------------------
  // 2. JSON-RPC 1.0 shape
  // -------------------------------------------------------------------------

  it('JSON-RPC 1.0 call — response has result/error fields (no jsonrpc)', async () => {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'add', params: { a: 5, b: 3 }, id: 99 }),
    });
    const response = (await res.json()) as {
      result: unknown;
      error: unknown;
      id: unknown;
      jsonrpc?: string;
    };
    expect(response.result).toBe(8);
    expect(response.error).toBeNull();
    expect(response.id).toBe(99);
    expect(response.jsonrpc).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 3. Batch request
  // -------------------------------------------------------------------------

  it('batch request — all results returned', async () => {
    const batch: AnyBatch = [
      { jsonrpc: '2.0', method: 'add', params: { a: 1, b: 2 }, id: 10 },
      { jsonrpc: '2.0', method: 'add', params: { a: 3, b: 4 }, id: 11 },
    ];
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });
    const responses = (await res.json()) as AnyResponse[];
    expect(responses).toHaveLength(2);

    const byId = Object.fromEntries(
      responses.map((r) => [(r as JsonRpcResponse2Ok).id, (r as JsonRpcResponse2Ok).result]),
    );
    expect(byId[10]).toBe(3);
    expect(byId[11]).toBe(7);
  });

  // -------------------------------------------------------------------------
  // 4. Notification — 204, side-effect runs
  // -------------------------------------------------------------------------

  it('notification — 204 No Content, handler runs', async () => {
    events.length = 0;
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'logEvent', params: { name: 'ping' } }),
    });
    expect(res.status).toBe(204);
    await new Promise((r) => setTimeout(r, 50));
    expect(events).toContain('ping');
  });

  // -------------------------------------------------------------------------
  // 5. Method not found → -32601
  // -------------------------------------------------------------------------

  it('method not found — returns error code -32601', async () => {
    expect.assertions(2);
    try {
      await (
        typedClient as unknown as Record<string, (p: unknown) => Promise<unknown>>
      ).nonexistent({});
    } catch (err) {
      const e = err as { code: number };
      expect(e.code).toBe(-32601);
      expect((err as Error).message).toMatch(/not found/i);
    }
  });

  // -------------------------------------------------------------------------
  // 6. Concurrent requests
  // -------------------------------------------------------------------------

  it('concurrent requests — all resolve correctly', async () => {
    const [r1, r2, r3] = await Promise.all([
      typedClient.add({ a: 1, b: 1 }),
      typedClient.add({ a: 2, b: 2 }),
      typedClient.add({ a: 3, b: 3 }),
    ]);
    expect(r1).toBe(2);
    expect(r2).toBe(4);
    expect(r3).toBe(6);
  });

  // -------------------------------------------------------------------------
  // 7. Invalid JSON → parse error -32700
  // -------------------------------------------------------------------------

  it('invalid JSON body — returns parse error -32700', async () => {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json{{{',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as JsonRpcResponse2Err;
    expect(body.error.code).toBe(-32700);
  });

  // -------------------------------------------------------------------------
  // 8. maxMessageSize exceeded → 413
  // -------------------------------------------------------------------------

  it('oversized body — server responds with 413', async () => {
    const tinyApp = express();
    tinyApp.post('/rpc', jsonRpcExpress(new JsonRpcServer(router), { maxMessageSize: 10 }));

    const tinyServer = tinyApp.listen(3221);
    await new Promise<void>((resolve) => tinyServer.once('listening', resolve));

    try {
      const res = await fetch('http://127.0.0.1:3221/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'add', params: { a: 1, b: 2 }, id: 1 }),
      });
      expect(res.status).toBe(413);
    } finally {
      await new Promise<void>((resolve) => tinyServer.close(() => resolve()));
    }
  });

  // -------------------------------------------------------------------------
  // 9. Works with express.json() pre-parser
  // -------------------------------------------------------------------------

  it('works with express.json() pre-parser upstream', { timeout: 10_000 }, async () => {
    const preApp = express();
    preApp.use(express.json());
    preApp.post('/rpc', jsonRpcExpress(new JsonRpcServer(router)));

    const preServer = preApp.listen(3222);
    await new Promise<void>((resolve) => preServer.once('listening', resolve));

    try {
      const res = await fetch('http://127.0.0.1:3222/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'add', params: { a: 7, b: 3 }, id: 1 }),
      });
      const body = (await res.json()) as JsonRpcResponse2Ok;
      expect(body.result).toBe(10);
    } finally {
      await new Promise<void>((resolve) => preServer.close(() => resolve()));
    }
  });
});
