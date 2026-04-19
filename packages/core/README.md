# @jsontpc/core

Zero-dependency JSON-RPC 1.0 + 2.0 protocol core — types, router, server, client, and adapter primitives.

- Supports **JSON-RPC 1.0 and 2.0** — version auto-detected per request
- **Typed procedure router** with optional [Zod](https://zod.dev) schema validation
- **Typed client proxy** — full IntelliSense, no code generation
- **Batch requests** — processed concurrently
- Zero runtime dependencies; works in Node.js, Deno, Bun, and edge runtimes

---

## Install

```bash
pnpm add @jsontpc/core
```

Optional peer dependency — add only if you want schema validation:

```bash
pnpm add zod
```

---

## Procedure Router

```ts
import { procedure, createRouter, JsonRpcServer } from '@jsontpc/core';
import { z } from 'zod';

const router = createRouter({
  add: procedure
    .input(z.object({ a: z.number(), b: z.number() }))
    .output(z.number())
    .handler(({ input }) => input.a + input.b),

  greet: procedure
    .input(z.object({ name: z.string() }))
    .handler(({ input }) => `Hello, ${input.name}!`),
});

const server = new JsonRpcServer(router);
```

### `procedure` builder

| Method | Description |
|--------|-------------|
| `.input(zodSchema)` | Validate and type incoming `params` |
| `.output(zodSchema)` | Validate and type the returned result (dev-mode only) |
| `.handler(fn)` | Set the handler — receives `{ input, context }` |

### `createRouter(handlers)`

Returns the record as-is with full TypeScript types. No runtime logic.

---

## JsonRpcServer

```ts
const server = new JsonRpcServer(router);

// Dispatch a single parsed request
const response = await server.handle(request, context?);

// Dispatch a batch
const responses = await server.handleBatch(requests, context?);
```

- `handle()` returns `undefined` for notifications (no response should be sent).
- `handleBatch()` returns `undefined` if all requests were notifications.
- Errors thrown in handlers are automatically wrapped in a `JsonRpcError(-32603)` response.

---

## Typed Client

```ts
import { createClient } from '@jsontpc/core';
import type { router } from './server';

const client = createClient<typeof router>(transport);

// Fully typed method call
const sum = await client.add({ a: 1, b: 2 }); // sum: number

// Batch (JSON-RPC 2.0)
const [r1, r2] = await client.$batch([
  client.$prepare.add({ a: 1, b: 2 }),
  client.$prepare.greet({ name: 'Alice' }),
]);
```

`createClient` returns a `Proxy` — no code generation step required. Types flow directly from the router definition.

---

## Adapter Primitives

These exports let you integrate `@jsontpc/core` with **any** HTTP framework.

### `createRequestHandler(server)` — simplest integration

```ts
import { createRequestHandler } from '@jsontpc/core';

const handle = createRequestHandler(server);
// (rawBody: string, context?: unknown) => Promise<string | null>
// Returns null when the request is a notification (send HTTP 204)

app.post('/rpc', async (req, res) => {
  const body = await readBody(req);
  const out = await handle(body, { req });
  if (out === null) return res.status(204).end();
  res.setHeader('Content-Type', 'application/json').end(out);
});
```

`createRequestHandler` never throws — parse errors become JSON-RPC error responses.

### `IFrameworkAdapter` + `bindAdapter` — structured adapter packages

```ts
import { IFrameworkAdapter, bindAdapter } from '@jsontpc/core';

class MyAdapter implements IFrameworkAdapter<MyReq, MyRes> {
  extractBody(req: MyReq): string | Promise<string> {
    return req.text();
  }
  writeResponse(res: MyRes, body: string | null): void {
    if (body === null) { res.status(204).end(); return; }
    res.setHeader('Content-Type', 'application/json').end(body);
  }
}

const rpcHandler = bindAdapter(server, new MyAdapter());
// (req: MyReq, res: MyRes, context?: unknown) => Promise<void>
app.post('/rpc', rpcHandler);
```

See [`examples/core/custom-adapter.ts`](../../examples/core/custom-adapter.ts) for a full working example using `node:http`.

---

## Error Codes

```ts
import { JsonRpcError, ErrorCode } from '@jsontpc/core';

// Throw from any handler
throw new JsonRpcError('Not authorized', -32001, { reason: 'token_expired' });
```

| Code | `ErrorCode` | Description |
|------|-------------|-------------|
| `-32700` | `PARSE_ERROR` | Invalid JSON received |
| `-32600` | `INVALID_REQUEST` | Not a valid Request object |
| `-32601` | `METHOD_NOT_FOUND` | Method does not exist |
| `-32602` | `INVALID_PARAMS` | Invalid method parameters |
| `-32603` | `INTERNAL_ERROR` | Internal server error |

In `NODE_ENV !== 'production'`, the original error message is included in `error.data.cause`. In production, `data` is `undefined` for internal errors (OWASP A05).

---

## Wire Types

All JSON-RPC wire shapes are exported as plain TypeScript interfaces:

`JsonRpcId` · `JsonRpcParams` · `JsonRpcErrorObject`  
`JsonRpcRequest1` · `JsonRpcResponse1` (1.0)  
`JsonRpcRequest2` · `JsonRpcResponse2Ok` · `JsonRpcResponse2Err` (2.0)  
`AnyRequest` · `AnyResponse` · `AnyBatch`

Type inference helpers: `InferProcedureInput<T>` · `InferProcedureOutput<T>` · `InferRouterInput<R>` · `InferRouterOutput<R>`
