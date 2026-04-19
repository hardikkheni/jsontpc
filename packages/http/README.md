# @jsontpc/http

HTTP transport for `@jsontpc/core` — uses the native Node.js `http` module and the global `fetch` API (Node 18+).

---

## Installation

```bash
pnpm add @jsontpc/http @jsontpc/core
```

---

## `HttpServerTransport`

Creates and manages a `node:http` server. On every POST to the configured path it reads the body,
dispatches through `@jsontpc/core`, and writes the JSON response with `Content-Type: application/json`.

### Constructor

```ts
new HttpServerTransport(options?: HttpServerTransportOptions)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `path` | `string` | `'/'` | URL path to accept requests on |
| `maxMessageSize` | `number` | `1_048_576` (1 MiB) | Max request body in bytes; 413 if exceeded |

### Usage

```ts
import { JsonRpcServer } from '@jsontpc/core';
import { HttpServerTransport } from '@jsontpc/http';

const server = new JsonRpcServer(router);
const transport = new HttpServerTransport({ path: '/rpc' });
transport.attach(server);
await transport.listen(3000);
```

### HTTP response codes

| Scenario | Status |
|----------|--------|
| Normal response | 200 `application/json` |
| Notification / all-notification batch | 204 No Content |
| Body exceeds `maxMessageSize` | 413 |
| Wrong HTTP method (not POST) | 405 |
| Wrong path | 404 |

---

## `HttpClientTransport`

Uses the global `fetch` API. POSTs the serialized request and returns the response body text.
HTTP transport is stateless — no `connect()` or `close()` needed.

### Constructor

```ts
new HttpClientTransport(url: string, options?: HttpClientTransportOptions)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `headers` | `Record<string, string>` | `{}` | Extra headers added to every request |

### Usage

```ts
import { createClient } from '@jsontpc/core';
import { HttpClientTransport } from '@jsontpc/http';

const client = createClient<typeof router>(
  new HttpClientTransport('http://localhost:3000/rpc')
);

const result = await client.add({ a: 1, b: 2 }); // 3
```

### Notifications

Send a notification by omitting the `id` field. The server responds with 204 and
`HttpClientTransport.send()` returns `''`.

```ts
await fetch('http://localhost:3000/rpc', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', method: 'logEvent', params: { name: 'ping' } }),
});
// → 204 No Content
```

---

See [docs/ARCHITECTURE.md §5.3](../../docs/ARCHITECTURE.md) for the full design.

