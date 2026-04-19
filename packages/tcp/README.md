# @jsontpc/tcp

TCP transport for `@jsontpc/core` — NDJSON framing over Node.js `net` sockets.

---

## Install

```bash
pnpm add @jsontpc/tcp
```

`@jsontpc/core` is automatically installed as a dependency.

---

## Quick Start

**Server**

```ts
import { createRouter, procedure, JsonRpcServer } from '@jsontpc/core';
import { TcpServerTransport } from '@jsontpc/tcp';
import { z } from 'zod';

const router = createRouter({
  add: procedure
    .input(z.object({ a: z.number(), b: z.number() }))
    .output(z.number())
    .handler(({ input }) => input.a + input.b),
});

const server = new JsonRpcServer(router);
const transport = new TcpServerTransport();
transport.attach(server);
await transport.listen(4000);
console.log('JSON-RPC TCP server listening on :4000');
```

**Client**

```ts
import { createClient } from '@jsontpc/core';
import { TcpClientTransport } from '@jsontpc/tcp';
import type { router } from './server';

const transport = new TcpClientTransport({ host: 'localhost', port: 4000 });
await transport.connect();

const client = createClient<typeof router>(transport);
const result = await client.add({ a: 10, b: 5 }); // → 15

await transport.close();
```

---

## API

### `TcpServerTransport`

```ts
new TcpServerTransport(options?: TcpServerTransportOptions)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `framer` | `IFramer` | `NdJsonFramer` | Message framing strategy |
| `maxMessageSize` | `number` | `1_048_576` (1 MiB) | Max incoming message size in bytes; socket is destroyed on excess |

| Method | Signature | Description |
|--------|-----------|-------------|
| `attach` | `(server: JsonRpcServer) => void` | Wire the server — call before `listen()` |
| `listen` | `(port: number) => Promise<void>` | Start listening; resolves when bound |
| `close` | `() => Promise<void>` | Stop accepting new connections |

### `TcpClientTransport`

```ts
new TcpClientTransport(options: TcpClientTransportOptions)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | `number` | *required* | Server port |
| `host` | `string` | `'127.0.0.1'` | Server hostname or IP |
| `framer` | `IFramer` | `NdJsonFramer` | Must match the server's framer |
| `maxMessageSize` | `number` | `1_048_576` (1 MiB) | Max incoming message size in bytes |

| Method | Signature | Description |
|--------|-----------|-------------|
| `connect` | `() => Promise<void>` | Open the TCP connection; call before `send()` |
| `send` | `(message: string) => Promise<string>` | Send a serialized JSON-RPC request; resolves with the raw response |
| `onMessage` | `(handler: (msg: string) => void) => void` | Subscribe to unsolicited server messages |
| `close` | `() => Promise<void>` | Gracefully close the connection |

---

## Custom Framing

Swap the default NDJSON framer with any strategy that implements `IFramer`:

```ts
import { Transform } from 'node:stream';
import type { IFramer } from '@jsontpc/tcp';
import { TcpServerTransport, TcpClientTransport } from '@jsontpc/tcp';

class LengthPrefixFramer implements IFramer {
  encode(message: string): Buffer {
    const payload = Buffer.from(message, 'utf8');
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32BE(payload.length, 0);
    return Buffer.concat([header, payload]);
  }

  createDecoder(): Transform {
    let buf = Buffer.alloc(0);
    return new Transform({
      readableObjectMode: true,
      transform(chunk: Buffer, _enc, cb) {
        buf = Buffer.concat([buf, chunk]);
        while (buf.length >= 4) {
          const len = buf.readUInt32BE(0);
          if (buf.length < 4 + len) break;
          this.push(buf.subarray(4, 4 + len).toString('utf8'));
          buf = buf.subarray(4 + len);
        }
        cb();
      },
    });
  }
}

const framer = new LengthPrefixFramer();
const serverTransport = new TcpServerTransport({ framer });
const clientTransport = new TcpClientTransport({ port: 4000, framer });
```

See [`examples/tcp/custom-framing.ts`](../../examples/tcp/custom-framing.ts) for a full runnable example.

---

## Security

- Incoming message size is capped at `maxMessageSize` (default 1 MiB). Oversized messages destroy the socket immediately to prevent memory exhaustion (OWASP A06).
- All JSON-RPC structure is validated by `@jsontpc/core` before reaching any handler.
