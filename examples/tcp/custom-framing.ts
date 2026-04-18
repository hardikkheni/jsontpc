/**
 * examples/tcp/custom-framing.ts
 *
 * Demonstrates swapping `NdJsonFramer` for a custom `IFramer` implementation.
 *
 * `LengthPrefixFramer` uses a 4-byte big-endian header that encodes the byte
 * length of the JSON payload, followed immediately by the payload bytes.
 * This framing is binary-safe (no delimiter scanning) and avoids any ambiguity
 * with newlines inside string values.
 *
 * Both the server and client are started in the same process so this example
 * is fully self-contained and exits cleanly.
 *
 * Run: pnpm --filter jsontpc-examples tcp:custom-framing
 */

import { Transform } from "node:stream";
import { createClient, createRouter, JsonRpcServer, procedure } from "@jsontpc/core";
import { TcpClientTransport, TcpServerTransport } from "@jsontpc/tcp";
import type { IFramer } from "@jsontpc/tcp";

// ---------------------------------------------------------------------------
// Custom framer: 4-byte big-endian length prefix
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Router & server
// ---------------------------------------------------------------------------

const router = createRouter({
  add: procedure.handler(({ input }) => {
    const { a, b } = input as { a: number; b: number };
    return a + b;
  }),

  greet: procedure.handler(({ input }) => {
    const { name } = input as { name: string };
    return `Hello, ${name}!`;
  }),
});

const framer = new LengthPrefixFramer();

const jsonRpcServer = new JsonRpcServer(router);
const serverTransport = new TcpServerTransport({ framer });
serverTransport.attach(jsonRpcServer);

await serverTransport.listen(3301);
console.log("Custom-framing server (LengthPrefixFramer) listening on port 3301");

// ---------------------------------------------------------------------------
// Client — must use the same framer
// ---------------------------------------------------------------------------

const clientTransport = new TcpClientTransport({ port: 3301, framer });
await clientTransport.connect();

const client = createClient<typeof router>(clientTransport);

const sum = await client.add({ a: 13, b: 29 });
console.log("add(13, 29) →", sum); // 42

const greeting = await client.greet({ name: "custom framer" });
console.log("greet('custom framer') →", greeting);

// ---------------------------------------------------------------------------
// Clean shutdown
// ---------------------------------------------------------------------------

await clientTransport.close();
await serverTransport.close();
console.log("Done. Server and client closed.");
