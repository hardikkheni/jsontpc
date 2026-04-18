import * as net from "node:net";
import { Transform } from "node:stream";
import { JsonRpcServer, createClient, createRouter, procedure } from "@jsontpc/core";
import type { AnyBatch, AnyResponse, JsonRpcResponse2Err, JsonRpcResponse2Ok } from "@jsontpc/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NdJsonFramer, TcpClientTransport, TcpServerTransport } from "../../src/index";
import type { IFramer } from "../../src/index";

// ---------------------------------------------------------------------------
// Shared router & server
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
// Main suite — default NdJsonFramer
// ---------------------------------------------------------------------------

describe("TcpServerTransport + TcpClientTransport (NDJSON)", () => {
  const PORT = 3201;
  let serverTransport: TcpServerTransport;
  let clientTransport: TcpClientTransport;
  let typedClient: ReturnType<typeof createClient<typeof router>>;

  beforeAll(async () => {
    serverTransport = new TcpServerTransport();
    serverTransport.attach(new JsonRpcServer(router));
    await serverTransport.listen(PORT);

    clientTransport = new TcpClientTransport({ port: PORT });
    await clientTransport.connect();

    typedClient = createClient<typeof router>(clientTransport);
  });

  afterAll(async () => {
    await clientTransport.close();
    await serverTransport.close();
  });

  // -------------------------------------------------------------------------
  // 1. JSON-RPC 2.0 basic calls via typed proxy
  // -------------------------------------------------------------------------

  it("add — typed proxy call", async () => {
    const result = await typedClient.add({ a: 10, b: 32 });
    expect(result).toBe(42);
  });

  it("greet — typed proxy call", async () => {
    const result = await typedClient.greet({ name: "World" });
    expect(result).toBe("Hello, World!");
  });

  // -------------------------------------------------------------------------
  // 2. JSON-RPC 1.0 shape (raw send)
  // -------------------------------------------------------------------------

  it("JSON-RPC 1.0 call — response has result/error fields (no jsonrpc)", async () => {
    const raw = JSON.stringify({ method: "add", params: { a: 5, b: 3 }, id: 99 });
    const responseRaw = await clientTransport.send(raw);
    const response = JSON.parse(responseRaw) as {
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
  // 3. Batch request (raw send)
  // -------------------------------------------------------------------------

  it("batch request — all results returned", async () => {
    const batch: AnyBatch = [
      { jsonrpc: "2.0", method: "add", params: { a: 1, b: 2 }, id: 10 },
      { jsonrpc: "2.0", method: "add", params: { a: 3, b: 4 }, id: 11 },
    ];

    // Batch responses arrive as a single JSON array message.
    const responsePromise = new Promise<string>((resolve) => {
      clientTransport.onMessage(resolve);
    });

    // Write the batch directly to the socket (bypassing `send` which tracks ids).
    // Cast needed to reach the private field from an integration test.
    (clientTransport as unknown as { socket: import("node:net").Socket }).socket.write(
      new NdJsonFramer().encode(JSON.stringify(batch)),
    );

    const responseRaw = await responsePromise;
    const responses = JSON.parse(responseRaw) as AnyResponse[];
    expect(responses).toHaveLength(2);

    const byId = Object.fromEntries(
      responses.map((r) => [(r as JsonRpcResponse2Ok).id, (r as JsonRpcResponse2Ok).result]),
    );
    expect(byId[10]).toBe(3);
    expect(byId[11]).toBe(7);
  });

  // -------------------------------------------------------------------------
  // 4. Notification — fire-and-forget, no response
  // -------------------------------------------------------------------------

  it("notification — server handler runs, send resolves empty string", async () => {
    events.length = 0;
    const notif = JSON.stringify({ jsonrpc: "2.0", method: "logEvent", params: { name: "ping" } });
    const result = await clientTransport.send(notif);
    expect(result).toBe("");
    // Give the async fire-and-forget handler time to run.
    await new Promise((r) => setTimeout(r, 50));
    expect(events).toContain("ping");
  });

  // -------------------------------------------------------------------------
  // 5. Method not found → error code -32601
  // -------------------------------------------------------------------------

  it("method not found — returns error code -32601", async () => {
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
  // 6. Multiple concurrent requests resolve independently
  // -------------------------------------------------------------------------

  it("concurrent requests — all resolve with correct results", async () => {
    const [r1, r2, r3] = await Promise.all([
      typedClient.add({ a: 1, b: 1 }),
      typedClient.add({ a: 2, b: 2 }),
      typedClient.add({ a: 3, b: 3 }),
    ]);
    expect(r1).toBe(2);
    expect(r2).toBe(4);
    expect(r3).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Custom framer suite
// ---------------------------------------------------------------------------

/**
 * Minimal 4-byte big-endian length-prefix framer used to verify IFramer is
 * pluggable — the same framer must be used on both ends.
 */
class LengthPrefixFramer implements IFramer {
  encode(message: string): Buffer {
    const payload = Buffer.from(message, "utf8");
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32BE(payload.length, 0);
    return Buffer.concat([header, payload]);
  }

  createDecoder(): Transform {
    let buf = Buffer.alloc(0);

    return new Transform({
      readableObjectMode: true,

      transform(chunk: Buffer, _encoding, callback) {
        buf = Buffer.concat([buf, chunk]);

        while (buf.length >= 4) {
          const msgLen = buf.readUInt32BE(0);
          if (buf.length < 4 + msgLen) break;
          const msg = buf.subarray(4, 4 + msgLen).toString("utf8");
          buf = buf.subarray(4 + msgLen);
          this.push(msg);
        }
        callback();
      },
    });
  }
}

describe("TcpServerTransport + TcpClientTransport (custom LengthPrefixFramer)", () => {
  const PORT = 3202;
  const framer = new LengthPrefixFramer();
  let serverTransport: TcpServerTransport;
  let clientTransport: TcpClientTransport;
  let typedClient: ReturnType<typeof createClient<typeof router>>;

  beforeAll(async () => {
    serverTransport = new TcpServerTransport({ framer });
    serverTransport.attach(new JsonRpcServer(router));
    await serverTransport.listen(PORT);

    clientTransport = new TcpClientTransport({ port: PORT, framer });
    await clientTransport.connect();

    typedClient = createClient<typeof router>(clientTransport);
  });

  afterAll(async () => {
    await clientTransport.close();
    await serverTransport.close();
  });

  it("add — works with custom length-prefix framer", async () => {
    const result = await typedClient.add({ a: 7, b: 8 });
    expect(result).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// maxMessageSize suite
// ---------------------------------------------------------------------------

describe("maxMessageSize — oversized message destroys socket", () => {
  const PORT = 3203;
  let serverTransport: TcpServerTransport;

  beforeAll(async () => {
    serverTransport = new TcpServerTransport({ maxMessageSize: 64 });
    serverTransport.attach(new JsonRpcServer(router));
    await serverTransport.listen(PORT);
  });

  afterAll(async () => {
    await serverTransport.close();
  });

  it("socket is destroyed when message exceeds maxMessageSize", async () => {
    expect.assertions(1);

    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({ port: PORT }, () => {
        // Send a message larger than 64 bytes.
        const oversized = JSON.stringify({
          jsonrpc: "2.0",
          method: "add",
          params: { a: 1, b: 2, padding: "x".repeat(200) },
          id: 1,
        });
        socket.write(new NdJsonFramer().encode(oversized));
      });

      socket.on("close", () => {
        expect(true).toBe(true); // socket was closed/destroyed by server
        resolve();
      });

      socket.on("error", () => {
        // error before close is also acceptable
      });

      setTimeout(() => reject(new Error("timeout waiting for socket close")), 3000);
    });
  });
});
