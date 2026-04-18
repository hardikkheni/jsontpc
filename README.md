# jsontpc

A transport-agnostic, fully-typed **JSON-RPC 1.0 + 2.0** library for Node.js written in TypeScript.

- Supports **JSON-RPC 1.0 and 2.0** — version auto-detected per request
- **Typed procedure router** with [Zod](https://zod.dev) schema validation for params & results
- **Typed client** — call remote methods with full IntelliSense, no code generation required
- **Transport-agnostic core** — plug in any transport: HTTP, TCP, WebSocket, or bring your own
- **Framework adapters** as subpath exports: Express, Fastify, NestJS
- **Batch requests** (JSON-RPC 2.0) — processed concurrently
- Dual **ESM + CJS** build, zero core runtime dependencies

---

## Table of Contents

- [Install](#install)
- [Quick Start](#quick-start)
  - [HTTP](#http)
  - [TCP](#tcp)
  - [WebSocket](#websocket)
  - [Express](#express)
  - [Fastify](#fastify)
  - [NestJS](#nestjs)
- [API Reference](#api-reference)
- [Error Codes](#error-codes)
- [Contributing](#contributing)

---

## Install

```bash
# npm
npm install jsontpc

# pnpm
pnpm add jsontpc

# yarn
yarn add jsontpc
```

Peer dependencies (install only what you use):

```bash
# Zod validation (strongly recommended)
pnpm add zod

# WebSocket transport
pnpm add ws
pnpm add -D @types/ws

# Express adapter
pnpm add express
pnpm add -D @types/express

# Fastify adapter
pnpm add fastify

# NestJS adapter
pnpm add @nestjs/core @nestjs/common reflect-metadata
```

---

## Quick Start

### HTTP

**Server**

```ts
import * as http from 'node:http';
import { createRouter, procedure, JsonRpcServer } from 'jsontpc';
import { HttpServerTransport } from 'jsontpc/http';
import { z } from 'zod';

const router = createRouter({
  add: procedure
    .input(z.object({ a: z.number(), b: z.number() }))
    .output(z.number())
    .handler(({ input }) => input.a + input.b),

  greet: procedure
    .input(z.object({ name: z.string() }))
    .output(z.string())
    .handler(({ input }) => `Hello, ${input.name}!`),
});

const server = new JsonRpcServer(router);
const transport = new HttpServerTransport(http.createServer(), { path: '/rpc' });
transport.attach(server);
transport.listen(3000);

console.log('JSON-RPC server listening on http://localhost:3000/rpc');
```

**Client**

```ts
import { createClient } from 'jsontpc';
import { HttpClientTransport } from 'jsontpc/http';
import type { router } from './server';

const client = createClient<typeof router>(
  new HttpClientTransport('http://localhost:3000/rpc')
);

const sum = await client.add({ a: 1, b: 2 });      // → 3
const msg = await client.greet({ name: 'World' });  // → "Hello, World!"
```

---

### TCP

**Server**

```ts
import * as net from 'node:net';
import { createRouter, procedure, JsonRpcServer } from 'jsontpc';
import { TcpServerTransport } from 'jsontpc/tcp';
import { z } from 'zod';

const router = createRouter({ /* ... */ });
const server = new JsonRpcServer(router);
const transport = new TcpServerTransport(net.createServer());
transport.attach(server);
transport.listen(4000);
```

**Client**

```ts
import { createClient } from 'jsontpc';
import { TcpClientTransport } from 'jsontpc/tcp';
import type { router } from './server';

const transport = new TcpClientTransport({ host: 'localhost', port: 4000 });
await transport.connect();

const client = createClient<typeof router>(transport);
const result = await client.add({ a: 10, b: 5 }); // → 15
```

---

### WebSocket

**Server**

```ts
import { WebSocketServer } from 'ws';
import { createRouter, procedure, JsonRpcServer } from 'jsontpc';
import { WsServerTransport } from 'jsontpc/ws';
import { z } from 'zod';

const router = createRouter({ /* ... */ });
const server = new JsonRpcServer(router);
const wss = new WebSocketServer({ port: 5000 });
const transport = new WsServerTransport(wss);
transport.attach(server);
```

**Client**

```ts
import { createClient } from 'jsontpc';
import { WsClientTransport } from 'jsontpc/ws';
import type { router } from './server';

const transport = new WsClientTransport('ws://localhost:5000');
await transport.connect();

const client = createClient<typeof router>(transport);
```

---

### Express

```ts
import express from 'express';
import { createRouter, procedure, JsonRpcServer } from 'jsontpc';
import { jsonRpcExpress } from 'jsontpc/express';
import { z } from 'zod';

const router = createRouter({ /* ... */ });
const server = new JsonRpcServer(router);

const app = express();
app.use(express.json());
app.post('/rpc', jsonRpcExpress(server));
app.listen(3000);
```

---

### Fastify

```ts
import Fastify from 'fastify';
import { createRouter, procedure, JsonRpcServer } from 'jsontpc';
import { jsonRpcFastify } from 'jsontpc/fastify';
import { z } from 'zod';

const router = createRouter({ /* ... */ });
const server = new JsonRpcServer(router);

const app = Fastify();
app.register(jsonRpcFastify(server), { prefix: '/rpc' });
await app.listen({ port: 3000 });
```

---

### NestJS

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { JsonRpcModule } from 'jsontpc/nestjs';

@Module({
  imports: [JsonRpcModule.forRoot({ path: '/rpc' })],
})
export class AppModule {}

// math.service.ts
import { Injectable } from '@nestjs/common';
import { JsonRpcHandler } from 'jsontpc/nestjs';
import { z } from 'zod';

@Injectable()
export class MathService {
  @JsonRpcHandler('add', {
    input: z.object({ a: z.number(), b: z.number() }),
    output: z.number(),
  })
  add({ a, b }: { a: number; b: number }) {
    return a + b;
  }
}
```

---

## API Reference

### Core

#### `createRouter(handlers)`

Creates a typed router from a map of procedure definitions.

```ts
const router = createRouter({
  methodName: procedure.input(schema).output(schema).handler(fn),
});
```

#### `procedure`

Fluent procedure builder.

| Method | Description |
|--------|-------------|
| `.input(zodSchema)` | Validate & type incoming `params` |
| `.output(zodSchema)` | Validate & type the returned result |
| `.handler(fn)` | Set the implementation — `fn` receives `{ input, context }` |

#### `JsonRpcServer`

```ts
const server = new JsonRpcServer(router);

// Register an additional handler at runtime
server.register('ping', async () => 'pong');

// Dispatch a raw parsed request (used internally by transports)
const response = await server.handle(request);
```

#### `createClient<TRouter>(transport)`

Returns a `Proxy` object with typed async methods mirroring every route in `TRouter`.

```ts
const client = createClient<typeof router>(transport);
await client.methodName(params); // fully typed

// Batch (JSON-RPC 2.0 only)
const [r1, r2] = await client.$batch([
  client.$prepare.add({ a: 1, b: 2 }),
  client.$prepare.greet({ name: 'Alice' }),
]);
```

---

### Transports

All transports implement a common `IClientTransport` or `IServerTransport` interface so they are interchangeable.

| Export path | Server class | Client class |
|---|---|---|
| `jsontpc/http` | `HttpServerTransport` | `HttpClientTransport` |
| `jsontpc/tcp` | `TcpServerTransport` | `TcpClientTransport` |
| `jsontpc/ws` | `WsServerTransport` | `WsClientTransport` |

TCP uses **newline-delimited JSON (NDJSON)** framing by default. A custom framer can be passed as an option.

---

### Framework Adapters

| Export path | Export | Usage |
|---|---|---|
| `jsontpc/express` | `jsonRpcExpress(server, opts?)` | Returns an Express `RequestHandler` |
| `jsontpc/fastify` | `jsonRpcFastify(server, opts?)` | Returns a Fastify plugin |
| `jsontpc/nestjs` | `JsonRpcModule`, `JsonRpcHandler`, `JsonRpcService` | NestJS dynamic module + decorator |

---

## Error Codes

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
import { JsonRpcError, ErrorCode } from 'jsontpc';

handler: () => {
  throw new JsonRpcError('Not authorized', -32001, { reason: 'token_expired' });
}
```

---

## Contributing

1. Fork & clone the repo
2. `pnpm install`
3. `pnpm build` — compiles with `tsup`
4. `pnpm test` — runs `vitest`
5. `pnpm typecheck` — runs `tsc --noEmit`

Please read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before contributing to understand the layer model and coding conventions.
