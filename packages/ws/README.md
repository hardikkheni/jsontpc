# @jsontpc/ws

WebSocket transport for `@jsontpc/core` — uses the [`ws`](https://github.com/websockets/ws) library.

> **Status: Not yet implemented.** See [docs/TODO.md](../../docs/TODO.md) for the implementation checklist.

### Peer dependency

```bash
pnpm add ws
pnpm add -D @types/ws
```

---

## Planned API

### `WsServerTransport`

Registers a `message` event handler on a `ws.WebSocketServer`. Dispatches each message via `@jsontpc/core` and writes the response back per connection.

```ts
import { WebSocketServer } from 'ws';
import { JsonRpcServer } from '@jsontpc/core';
import { WsServerTransport } from '@jsontpc/ws';

const server = new JsonRpcServer(router);
const wss = new WebSocketServer({ port: 5000 });
const transport = new WsServerTransport(wss);
transport.attach(server);
```

### `WsClientTransport`

Holds a single `ws.WebSocket` connection. Uses a pending-request `Map` keyed by `id` to correlate responses, supporting many in-flight requests simultaneously. Also supports server-to-client notifications via `onMessage`.

```ts
import { createClient } from '@jsontpc/core';
import { WsClientTransport } from '@jsontpc/ws';

const transport = new WsClientTransport('ws://localhost:5000');
await transport.connect();
const client = createClient<typeof router>(transport);
```

---

See [docs/ARCHITECTURE.md §5.5](../../docs/ARCHITECTURE.md) for the full design.
