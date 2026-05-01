# @jsontpc/ws

WebSocket transport for `@jsontpc/core` — persistent bidirectional connection over Node.js [`ws`](https://github.com/websockets/ws) library.

---

## Install

```bash
pnpm add @jsontpc/ws ws
```

`@jsontpc/core` is automatically installed as a dependency.

---

## Quick Start

**Server**

```ts
import { createRouter, procedure, JsonRpcServer } from '@jsontpc/core';
import { WsServerTransport } from '@jsontpc/ws';
import { z } from 'zod';

const router = createRouter({
  add: procedure
    .input(z.object({ a: z.number(), b: z.number() }))
    .output(z.number())
    .handler(({ input }) => input.a + input.b),
});

const server = new JsonRpcServer(router);
const transport = new WsServerTransport({ port: 3400 });
transport.attach(server);
await transport.listen();
console.log('JSON-RPC WebSocket server listening on ws://localhost:3400');
```

**Client**

```ts
import { createClient } from '@jsontpc/core';
import { WsClientTransport } from '@jsontpc/ws';
import type { router } from './server';

const transport = new WsClientTransport({ url: 'ws://localhost:3400' });
await transport.connect();

const client = createClient<typeof router>(transport);
const result = await client.add({ a: 10, b: 5 }); // → 15

await transport.close();
```

---

## API

### `WsServerTransport`

```ts
new WsServerTransport(options?: WsServerTransportOptions)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | `number` | undefined | WebSocket server port (created automatically if provided) |
| `host` | `string` | undefined | WebSocket server host (defaults to all interfaces) |
| `maxMessageSize` | `number` | `1_048_576` (1 MiB) | Max incoming message size in bytes; connection is destroyed on excess |

| Method | Signature | Description |
|--------|-----------|-------------|
| `attach` | `(server: JsonRpcServer) => void` | Wire the server — call before `listen()` |
| `listen` | `(port?: number) => Promise<void>` | Start listening; resolves when bound |
| `close` | `() => Promise<void>` | Stop accepting new connections and close all open sockets |

### `WsClientTransport`

```ts
new WsClientTransport(options: WsClientTransportOptions)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | *required* | WebSocket server URL (e.g., `'ws://localhost:3400'`) |
| `maxMessageSize` | `number` | `1_048_576` (1 MiB) | Max incoming message size in bytes; connection is destroyed on excess |

| Method | Signature | Description |
|--------|-----------|-------------|
| `connect` | `() => Promise<void>` | Open the WebSocket connection; call before `send()` |
| `send` | `(message: string) => Promise<string>` | Send a serialized JSON-RPC request; resolves with the raw response |
| `onMessage` | `(handler: (msg: string) => void) => void` | Subscribe to unsolicited server messages (batch responses, etc.) |
| `close` | `() => Promise<void>` | Gracefully close the connection |

---

## WebSocket Characteristics

- **Persistent bidirectional connection** — single connection per client, reused for all RPC calls
- **Full-duplex** — server and client can send messages at any time
- **In-flight request correlation** — multiple concurrent calls via `id` mapping (like TCP)
- **Notifications** — omit `id` field for fire-and-forget messages
- **Automatic frame boundaries** — messages are self-delimiting (no custom framing needed, unlike TCP)
- **Message size limits** — oversized messages destroy the connection to prevent memory exhaustion (OWASP A06)

---

## Error Handling

- **Connection refused** — `connect()` rejects with connection error
- **Connection closed** — pending requests reject with "connection closed" error
- **Message size exceeded** — connection destroyed with close code 1009 (MANDATORY_EXT)
- **Handler errors** — caught and converted to JSON-RPC error responses (same as all transports)

---

## Security

- Incoming message size is capped at `maxMessageSize` (default 1 MiB). Oversized messages destroy the connection immediately to prevent memory exhaustion (OWASP A06).
- All JSON-RPC structure is validated by `@jsontpc/core` before reaching any handler.

---

See [docs/ARCHITECTURE.md §5.5](../../docs/ARCHITECTURE.md) for the full design.
