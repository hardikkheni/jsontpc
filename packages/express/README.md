# @jsontpc/express

Express middleware adapter for `@jsontpc/core`.

---

## Installation

```bash
pnpm add @jsontpc/express @jsontpc/core
pnpm add express          # peer dependency
```

---

## `jsonRpcExpress(server, options?)`

Returns an Express `RequestHandler` that dispatches JSON-RPC requests to the given `JsonRpcServer`.

### Signature

```ts
function jsonRpcExpress(
  server: JsonRpcServer,
  options?: JsonRpcExpressOptions,
): RequestHandler
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxMessageSize` | `number` | `1_048_576` (1 MiB) | Max raw body bytes. Only enforced when `express.json()` is **not** used upstream. |

### Usage — without `express.json()`

The middleware reads the raw request body directly and enforces `maxMessageSize`.

```ts
import express from 'express';
import { JsonRpcServer } from '@jsontpc/core';
import { jsonRpcExpress } from '@jsontpc/express';

const server = new JsonRpcServer(router);
const app = express();

app.post('/rpc', jsonRpcExpress(server));
app.listen(3000);
```

### Usage — with `express.json()` upstream

When `express.json()` is mounted first, the adapter detects the pre-parsed `req.body` and re-serializes it. The `maxMessageSize` option has no effect in this mode (Express's own `limit` option applies instead).

```ts
const app = express();
app.use(express.json());                  // Express enforces body limit here
app.post('/rpc', jsonRpcExpress(server));
app.listen(3000);
```

### HTTP response codes

| Scenario | Status |
|----------|--------|
| Normal response | 200 `application/json` |
| Notification / all-notification batch | 204 No Content |
| Body exceeds `maxMessageSize` (raw mode) | 413 |

> HTTP method and path filtering is handled by Express routing (`app.post`). The middleware itself does not restrict the HTTP method.

---

## Client

Use `HttpClientTransport` from `@jsontpc/http` to call the Express server:

```ts
import { createClient } from '@jsontpc/core';
import { HttpClientTransport } from '@jsontpc/http';

const client = createClient<typeof router>(
  new HttpClientTransport('http://localhost:3000/rpc')
);

const result = await client.add({ a: 1, b: 2 }); // 3
```

---

## How it works

`jsonRpcExpress` is implemented with `bindAdapter` from `@jsontpc/core`. It never reimplements the JSON-RPC dispatch loop — parse → handle/handleBatch → serialize is always delegated to core.

---

See [docs/ARCHITECTURE.md §7.1](../../docs/ARCHITECTURE.md) for the full design.
