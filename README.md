<div align="center">

# 🔌 jsontpc

**Transport-agnostic, fully-typed JSON-RPC 1.0 + 2.0 for Node.js**

[![CI](https://img.shields.io/github/actions/workflow/status/hardikkheni/jsontpc/ci.yml?branch=main&label=CI&logo=github)](https://github.com/hardikkheni/jsontpc/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@jsontpc/core?label=%40jsontpc%2Fcore&logo=npm&color=cb3837)](https://www.npmjs.com/package/@jsontpc/core)
[![npm downloads](https://img.shields.io/npm/dm/@jsontpc/core?label=downloads&logo=npm)](https://www.npmjs.com/package/@jsontpc/core)
[![License: MIT](https://img.shields.io/npm/l/@jsontpc/core)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![GitHub Stars](https://img.shields.io/github/stars/hardikkheni/jsontpc?style=social)](https://github.com/hardikkheni/jsontpc/stargazers)

</div>

---

> **Zero-dependency core. Plug-in any transport. Full IntelliSense from router to client — no code generation.**

- 🔀 **JSON-RPC 1.0 + 2.0** — version auto-detected per request
- 🛡️ **Typed procedure router** with [Zod](https://zod.dev) validation for params & results
- 🧠 **Typed client proxy** — call remote methods with full IntelliSense, no codegen
- 🚌 **Transport-agnostic core** — HTTP, TCP, WebSocket, or bring your own
- 🔧 **Build your own adapter** via `createRequestHandler` / `IFrameworkAdapter`
- ⚡ **Concurrent batch requests** (JSON-RPC 2.0)
- 📦 **Dual ESM + CJS** build, zero core runtime dependencies

---

## 📖 Table of Contents

- [📦 Packages](#-packages)
- [⚡ Install](#-install)
- [🚀 Quick Start](#-quick-start)
  - [HTTP](#http)
  - [TCP](#tcp)
  - [Custom Adapters](#custom-adapters)
- [❌ Error Codes](#-error-codes)
- [🧪 Examples](#-examples)
- [🗺️ v0.2 Roadmap](#️-v02-roadmap)
- [🤝 Contributing](#-contributing)

---

## 📦 Packages

| Package | Version | Downloads | Description |
|---------|---------|-----------|-------------|
| [`@jsontpc/core`](packages/core/README.md) | [![npm](https://img.shields.io/npm/v/@jsontpc/core?label=&color=cb3837)](https://www.npmjs.com/package/@jsontpc/core) | [![npm](https://img.shields.io/npm/dm/@jsontpc/core?label=)](https://www.npmjs.com/package/@jsontpc/core) | ✅ Protocol core — types, router, server, client, adapter primitives |
| [`@jsontpc/http`](packages/http/README.md) | [![npm](https://img.shields.io/npm/v/@jsontpc/http?label=&color=cb3837)](https://www.npmjs.com/package/@jsontpc/http) | [![npm](https://img.shields.io/npm/dm/@jsontpc/http?label=)](https://www.npmjs.com/package/@jsontpc/http) | ✅ HTTP transport (`node:http` + `fetch`) |
| [`@jsontpc/tcp`](packages/tcp/README.md) | [![npm](https://img.shields.io/npm/v/@jsontpc/tcp?label=&color=cb3837)](https://www.npmjs.com/package/@jsontpc/tcp) | [![npm](https://img.shields.io/npm/dm/@jsontpc/tcp?label=)](https://www.npmjs.com/package/@jsontpc/tcp) | ✅ TCP transport (NDJSON framing, custom framer support) |
| [`@jsontpc/ws`](packages/ws/README.md) | — | — | 🚧 WebSocket transport (`ws`) |
| [`@jsontpc/express`](packages/express/README.md) | — | — | 🚧 Express middleware adapter |
| [`@jsontpc/fastify`](packages/fastify/README.md) | — | — | 🚧 Fastify plugin adapter |
| [`@jsontpc/nestjs`](packages/nestjs/README.md) | — | — | 🚧 NestJS dynamic module + decorator adapter |
| [`@jsontpc/pubsub`](packages/pubsub/README.md) | — | — | 🗓 v0.2 — Pub/sub push, typed topics, polling fallback, EventBus |

---

## ⚡ Install

```bash
pnpm add @jsontpc/core        # always required
pnpm add @jsontpc/http        # HTTP transport
pnpm add @jsontpc/tcp         # TCP transport
pnpm add zod                  # optional — schema validation
```

---

## 🚀 Quick Start

### HTTP

**Server**

```ts
import { createRouter, procedure, JsonRpcServer } from '@jsontpc/core';
import { HttpServerTransport } from '@jsontpc/http';
import { z } from 'zod';

const router = createRouter({
  add: procedure
    .input(z.object({ a: z.number(), b: z.number() }))
    .output(z.number())
    .handler(({ input }) => input.a + input.b),
});

const server = new JsonRpcServer(router);
const transport = new HttpServerTransport({ path: '/rpc' });
transport.attach(server);
await transport.listen(3000);
```

**Client**

```ts
import { createClient } from '@jsontpc/core';
import { HttpClientTransport } from '@jsontpc/http';
import type { router } from './server';

const client = createClient<typeof router>(
  new HttpClientTransport('http://localhost:3000/rpc')
);
const result = await client.add({ a: 10, b: 5 }); // → 15
```

HTTP transport is stateless — no `connect()`/`close()` required. Notifications return `''` from `send()` (server responds 204).

---

### TCP

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

### Custom Adapters

`@jsontpc/core` exports two integration paths for building adapters for **any** HTTP framework:

**Path 1 — Function factory** (simplest, no boilerplate)

```ts
import { createRouter, procedure, JsonRpcServer, createRequestHandler } from '@jsontpc/core';

const router = createRouter({ /* ... */ });
const server = new JsonRpcServer(router);

// Returns (rawBody: string, context?: unknown) => Promise<string | null>
// null means it was a notification — send no response (HTTP 204)
const handle = createRequestHandler(server);

// Works with any framework that exposes the raw body as a string
// Example: Hono
app.post('/rpc', async (c) => {
  const rawBody = await c.req.text();
  const responseBody = await handle(rawBody, { req: c.req });
  if (responseBody === null) return c.body(null, 204);
  return c.json(JSON.parse(responseBody));
});
```

**Path 2 — OOP interface** (for publishable adapter packages)

```ts
import {
  createRouter, procedure, JsonRpcServer,
  IFrameworkAdapter, bindAdapter,
} from '@jsontpc/core';

class HonoAdapter implements IFrameworkAdapter<HonoContext, HonoContext> {
  extractBody(c: HonoContext) {
    return c.req.text();    // raw JSON string
  }
  writeResponse(c: HonoContext, body: string | null) {
    if (body === null) return c.body(null, 204);
    return c.json(JSON.parse(body));
  }
}

const router = createRouter({ /* ... */ });
const server = new JsonRpcServer(router);

// rpcHandler: (req: HonoContext, res: HonoContext, context?) => Promise<void>
const rpcHandler = bindAdapter(server, new HonoAdapter());

app.post('/rpc', (c) => rpcHandler(c, c));
```

See [`examples/core/custom-adapter.ts`](examples/core/custom-adapter.ts) for a full working example using `node:http` (zero extra dependencies).

---

## ❌ Error Codes

Standard JSON-RPC error codes:

| Code | Name | Description |
|------|------|-------------|
| `-32700` | `PARSE_ERROR` | Invalid JSON received |
| `-32600` | `INVALID_REQUEST` | Not a valid Request object |
| `-32601` | `METHOD_NOT_FOUND` | Method does not exist |
| `-32602` | `INVALID_PARAMS` | Invalid method parameters |
| `-32603` | `INTERNAL_ERROR` | Internal JSON-RPC error |
| `-32000` to `-32099` | Server error | Reserved for implementation-defined errors |

Throw a `JsonRpcError` from a handler to return a typed error to the client:

```ts
import { JsonRpcError, ErrorCode } from '@jsontpc/core';

handler: () => {
  throw new JsonRpcError('Not authorized', -32001, { reason: 'token_expired' });
}
```

---

## 🧪 Examples

All examples are runnable TypeScript scripts (no compile step). Requires `pnpm install` first.

```bash
# Core examples
pnpm --filter jsontpc-examples core:basic          # createRouter + server.handle() with no transport
pnpm --filter jsontpc-examples core:zod-validation # Zod .input()/.output() — valid + invalid call
pnpm --filter jsontpc-examples core:notifications  # v1 + v2 fire-and-forget notifications
pnpm --filter jsontpc-examples core:batch          # handleBatch — concurrent, mixed, all-notification
pnpm --filter jsontpc-examples core:custom-adapter # IFrameworkAdapter + bindAdapter with node:http

# HTTP examples (run server in one terminal, client in another)
pnpm --filter jsontpc-examples http:server         # Start HTTP server on port 3100
pnpm --filter jsontpc-examples http:client         # Run typed proxy demo against port 3100

# TCP examples (run server in one terminal, client in another)
pnpm --filter jsontpc-examples tcp:server          # Start TCP server on port 3300
pnpm --filter jsontpc-examples tcp:client          # Run typed proxy demo against port 3300
pnpm --filter jsontpc-examples tcp:custom-framing  # Length-prefix framer demo
```

See [`examples/`](examples/) for the full list.

---

## 🗺️ v0.2 Roadmap

The following features are planned for the v0.2 release. All additions will be fully backward-compatible.

### Typed Context

Thread a `TContext` generic through procedures, the server, and adapter helpers. Use `createProcedure<MyContext>()` to get a fully-typed `context` argument in handlers — no casts required.

```ts
// 🗓 Planned
const p = createProcedure<{ userId: string; role: string }>();
const server = new JsonRpcServer<typeof router, MyContext>(router);
server.handle(req, { userId: '42', role: 'admin' }); // type-safe
```

New exports from `@jsontpc/core`: `createProcedure<TContext>()`

### Middleware 🗓 Planned

Composable `next()`-style middleware at the global server level and per-procedure level.

```ts
// 🗓 Planned
server.use(async (ctx, next) => { /* auth */ await next(); });

router = createRouter({
  secure: procedure
    .use(async (ctx, next) => { /* ACL */ await next(); })
    .handler(fn),
});
```

Execution order: global middleware → per-procedure middleware → input validation → handler.

New exports from `@jsontpc/core`: `MiddlewareFn<TContext>`, `MiddlewareContext<TContext>`

### Pub/Sub (`@jsontpc/pubsub`)

Server-to-client push notifications over TCP and WebSocket, with a transparent polling fallback for HTTP. Topics and their payloads are **fully type-safe** — declare once, enforced everywhere. Includes a typed in-process `EventBus` for intra-handler communication.

```ts
// 🗓 Planned
import { PubSubServer, createPubSubClient, EventBus } from '@jsontpc/pubsub';
import type { PubSubTopics } from '@jsontpc/core';

// Declare your topics once — keys are topic names, values are payload shapes
interface AppTopics extends PubSubTopics {
  'prices.updated': { symbol: string; price: number };
  'order.placed':   { orderId: string; amount: number };
}

// Server-side — publish() is typed: wrong payload shape = compile error
const pubsub = new PubSubServer<typeof router, unknown, AppTopics>(server, transport);
await pubsub.publish('prices.updated', { symbol: 'BTC', price: 65000 }); // ✓
await pubsub.publish('prices.updated', { symbol: 'BTC', price: '65k' }); // ✗ type error

// Client-side — $subscribe callback is typed from AppTopics
const client = createPubSubClient<typeof router, AppTopics>(transport);
await client.$subscribe('prices.updated', ({ symbol, price }) => {
  //                                         ^^^^^^  ^^^^^  fully typed, no casts
  console.log(symbol, price);
});
```

New package: `@jsontpc/pubsub` (depends on `@jsontpc/core`).
New exports from `@jsontpc/core`: `IPubSubTransport`, `IEventBus<TEvents>`, `PubSubTopics`, `TopicNotification<TTopics>`, `InferTopicPayload<TTopics, K>`

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) sections 11–13 for the full design.
See [docs/TODO.md](docs/TODO.md) Phases 6–8 for the implementation checklist.

---

## 🤝 Contributing

1. Fork & clone the repo
2. `pnpm install`
3. `pnpm build` — compiles with `tsup`
4. `pnpm test` — runs `vitest`
5. `pnpm typecheck` — runs `tsc --noEmit`

Please read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before contributing to understand the layer model and coding conventions.
