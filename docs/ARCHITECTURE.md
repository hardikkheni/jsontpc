# Architecture

This document describes the internal design of `jsontpc` — how the layers fit together, how types flow, and the reasoning behind key decisions.

---

## Table of Contents

1. [Layer Model](#1-layer-model)
2. [Core Protocol](#2-core-protocol)
   - [Wire Types](#21-wire-types)
   - [Version Detection](#22-version-detection)
   - [Parsing & Serialization](#23-parsing--serialization)
3. [Procedure Router & Zod Validation](#3-procedure-router--zod-validation)
   - [Procedure Builder](#31-procedure-builder)
   - [Type Inference](#32-type-inference)
4. [JsonRpcServer — Dispatch Engine](#4-jsonrpcserver--dispatch-engine)
   - [Single Request Flow](#41-single-request-flow)
   - [Notification Flow](#42-notification-flow)
   - [Batch Flow](#43-batch-flow)
5. [Transport Abstraction](#5-transport-abstraction)
   - [IServerTransport](#51-iservertransport)
   - [IClientTransport](#52-iclienttransport)
   - [HTTP Transport](#53-http-transport)
   - [TCP Transport & NDJSON Framing](#54-tcp-transport--ndjson-framing)
   - [WebSocket Transport](#55-websocket-transport)
6. [Typed Client Proxy](#6-typed-client-proxy)
   - [Proxy Mechanics](#61-proxy-mechanics)
   - [Batch Client](#62-batch-client)
   - [Pending Request Map](#63-pending-request-map)
7. [Framework Adapters](#7-framework-adapters)
   - [Express](#71-express)
   - [Fastify](#72-fastify)
   - [NestJS](#73-nestjs)
   - [Generic Adapter Interface](#74-generic-adapter-interface)
8. [Error Handling](#8-error-handling)
9. [Package Layout & Build](#9-package-layout--build)
10. [Design Decisions & Trade-offs](#10-design-decisions--trade-offs)
11. [Typed Context — Planned (v0.2)](#11-typed-context--planned-v02)
    - [createProcedure Factory](#111-createprocedure-factory)
    - [JsonRpcServer TContext Generic](#112-jsonrpcserver-tcontext-generic)
    - [Adapter Context Generics](#113-adapter-context-generics)
12. [Middleware Pipeline — Planned (v0.2)](#12-middleware-pipeline--planned-v02)
    - [MiddlewareContext & MiddlewareFn](#121-middlewarecontext--middlewarefn)
    - [Global Middleware](#122-global-middleware)
    - [Per-Procedure Middleware](#123-per-procedure-middleware)
    - [Execution Order](#124-execution-order)
13. [Pub/Sub & Event Bus — Planned (v0.2)](#13-pubsub--event-bus--planned-v02)
    - [IPubSubTransport Interface](#131-ipubsubtransport-interface)
    - [PubSubServer](#132-pubsubserver)
    - [Polling Fallback](#133-polling-fallback)
    - [PubSub Client](#134-pubsub-client)
    - [IEventBus & EventBus](#135-ieventbus--eventbus)
    - [Wire Protocol](#136-wire-protocol)
    - [Package Layout (v0.2)](#137-package-layout-v02)
14. [Examples](#14-examples)

---

## 1. Layer Model

```
┌─────────────────────────────────────────────────────────┐
│                    Application Code                      │
│           (router definitions, handler logic)            │
└────────────────────────┬────────────────────────────────┘
                         │ createRouter() / procedure
┌────────────────────────▼────────────────────────────────┐
│                        CORE                              │
│  types.ts · errors.ts · protocol.ts · router.ts         │
│  server.ts (JsonRpcServer) · client.ts (createClient)   │
│                                                          │
│  • Zero runtime dependencies                             │
│  • Zod only used when .input()/.output() called          │
│  • Works in any JS environment                           │
└────────┬─────────────────────────────┬───────────────────┘
         │ IServerTransport             │ IClientTransport
┌────────▼────────┐          ┌─────────▼────────────────┐
│  Server         │          │  Client                  │
│  Transports     │          │  Transports              │
│  http · tcp · ws│          │  http · tcp · ws         │
└────────┬────────┘          └─────────┬────────────────┘
         │                             │
┌────────▼─────────────────────────────▼────────────────┐
│                  Framework Adapters                     │
│               express · fastify · nestjs               │
└────────────────────────────────────────────────────────┘
```

The core has **zero runtime dependencies**. Zod is a peer dependency used only when a procedure declares `.input()` or `.output()`. If not installed, raw unvalidated values are passed through to the handler.

---

## 2. Core Protocol

### 2.1 Wire Types

`packages/core/src/types.ts` contains the TypeScript representation of all JSON-RPC objects:

```
JsonRpcId            = string | number | null
JsonRpcParams        = unknown[] | Record<string, unknown>

// JSON-RPC 1.0
JsonRpcRequest1      = { method, params, id }
JsonRpcResponse1     = { result, error, id }

// JSON-RPC 2.0
JsonRpcRequest2      = { jsonrpc: "2.0", method, params?, id? }
JsonRpcResponse2Ok   = { jsonrpc: "2.0", result, id }
JsonRpcResponse2Err  = { jsonrpc: "2.0", error: JsonRpcErrorObject, id }
JsonRpcNotification  = JsonRpcRequest2 without id (or id omitted)

AnyRequest           = JsonRpcRequest1 | JsonRpcRequest2
AnyResponse          = JsonRpcResponse1 | JsonRpcResponse2Ok | JsonRpcResponse2Err
AnyBatch             = AnyRequest[]
```

All types are **plain interfaces** — no classes. This keeps them serializable by default and usable as Zod schemas if needed.

### 2.2 Version Detection

`packages/core/src/protocol.ts` — `detectVersion(raw: unknown): 1 | 2`

- If `raw.jsonrpc === "2.0"` → version 2
- Otherwise → version 1 (1.0 has no `jsonrpc` field, or it may be `"1.0"`)

This is done after parsing, so the string `"2.0"` comparison is exact.

### 2.3 Parsing & Serialization

```
parseMessage(raw: string): AnyRequest | AnyBatch
  → JSON.parse() → structural validation → throws JsonRpcError(-32700) on invalid JSON
  → validates required fields   → throws JsonRpcError(-32600) on invalid request shape

serializeResponse(res: AnyResponse): string
  → JSON.stringify() — never throws (error objects are always serializable)

isNotification(req: AnyRequest): boolean
  → version 1: id === null
  → version 2: id is absent (undefined)

isBatch(parsed: unknown): parsed is AnyBatch
  → Array.isArray(parsed) && parsed.length > 0
```

---

## 3. Procedure Router & Zod Validation

### 3.1 Procedure Builder

`packages/core/src/router.ts`

`procedure` is a fluent builder that accumulates a Zod input schema, Zod output schema, and a handler function:

```
procedure                          // ProcedureBuilder<unknown, unknown>
  .input(z.object({...}))         // ProcedureBuilder<InputType, unknown>
  .output(z.number())             // ProcedureBuilder<InputType, OutputType>
  .handler(async ({ input }) => ) // ProcedureDef<InputType, OutputType>
```

`ProcedureDef` is a plain object:

```ts
interface ProcedureDef<TIn, TOut> {
  inputSchema?: ZodType<TIn>;
  outputSchema?: ZodType<TOut>;
  handler: (ctx: HandlerContext<TIn>) => TOut | Promise<TOut>;
}
```

`HandlerContext<TIn>` carries:
- `input: TIn` — validated (or raw if no schema) params
- `context: unknown` — transport-provided per-request context (e.g. Express `req`)

`createRouter(handlers)` just returns the record as-is with type annotation; no runtime logic needed.

### 3.2 Type Inference

Helper types exported from `router.ts`:

```ts
// Extract the input type of a single procedure
type InferProcedureInput<T> = T extends ProcedureDef<infer I, any> ? I : never;

// Extract the output type
type InferProcedureOutput<T> = T extends ProcedureDef<any, infer O> ? O : never;

// Full router input/output maps
type InferRouterInput<R>  = { [K in keyof R]: InferProcedureInput<R[K]> };
type InferRouterOutput<R> = { [K in keyof R]: InferProcedureOutput<R[K]> };
```

These are used by `createClient` to type the proxy object at the call site with no code generation.

---

## 4. JsonRpcServer — Dispatch Engine

`packages/core/src/server.ts`

### 4.1 Single Request Flow

```
handle(rawRequest: AnyRequest, context?)
  ├─ detectVersion()
  ├─ look up procedure by req.method
  │    └─ not found → JsonRpcError(-32601)
  ├─ validate params with inputSchema (if present)
  │    └─ Zod failure → JsonRpcError(-32602)
  ├─ call handler(input, context)
  │    └─ thrown Error  → JsonRpcError(-32603) or re-wrap JsonRpcError
  │    └─ thrown JsonRpcError → pass through
  ├─ validate result with outputSchema (if present, dev mode)
  └─ build & return AnyResponse (1.0 or 2.0 shape depending on version)
```

### 4.2 Notification Flow

When `isNotification(req) === true`:
- Handler is still called (side effects must happen)
- Response is **never** returned — the function returns `undefined`
- Errors inside notification handlers are swallowed (logged, not returned)

### 4.3 Batch Flow

When `isBatch(parsed) === true`:

```
handleBatch(requests: AnyBatch, context?)
  ├─ Filter out notifications (handle them fire-and-forget)
  ├─ Map remaining requests to Promise<AnyResponse> via handle()
  ├─ await Promise.all([...])   ← concurrent, any order
  └─ return AnyResponse[]
       └─ if array is empty (all were notifications) → return nothing
```

The spec says the server MAY process batch concurrently; we always do.

---

## 5. Transport Abstraction

### 5.1 IServerTransport

```ts
interface IServerTransport {
  /** Called by attach() — wire the server's handle() to incoming messages */
  attach(server: JsonRpcServer): void;
  listen(port: number): void;
  close(): Promise<void>;
}
```

### 5.2 IClientTransport

```ts
interface IClientTransport {
  /** Send a serialized JSON-RPC request, resolve with the raw response string */
  send(message: string): Promise<string>;
  /** For streaming transports (TCP/WS): subscribe to unsolicited messages */
  onMessage?: (handler: (msg: string) => void) => void;
  connect?(): Promise<void>;
  close?(): Promise<void>;
}
```

### 5.3 HTTP Transport

- **Server** (`HttpServerTransport`): registers a `request` listener on an `http.Server`. On every POST to the configured path, reads the body, calls `server.handle()`, writes the JSON response with `Content-Type: application/json`.
- **Client** (`HttpClientTransport`): uses the global `fetch` API (Node 18+). POSTs the serialized message, returns the response body text.
- HTTP transport is **stateless** and **request-response only** — no server-push.

### 5.4 TCP Transport & NDJSON Framing

TCP is a byte stream. Messages must be framed. The default framer is **Newline-Delimited JSON (NDJSON)**: each message is a single JSON object followed by `\n`.

`IFramer` interface allows swapping framing strategies:

```ts
interface IFramer {
  encode(message: string): Buffer;
  createDecoder(): Transform; // Node.js Transform stream that emits one string per message
}
```

`NdJsonFramer` (default):
- `encode`: appends `\n` to the UTF-8 encoded message
- `createDecoder`: splits on `\n` lines using a `Transform` stream, emitting each complete line

**Server** (`TcpServerTransport`):
- Listens on `net.Server`
- For each socket: pipes through `framer.createDecoder()`, calls `server.handle()` per message, encodes response via `framer.encode()`, writes back to socket

**Client** (`TcpClientTransport`):
- Holds a single `net.Socket` connection
- Pending requests are keyed by `id` in a `Map<JsonRpcId, { resolve, reject }>` 
- Incoming messages are decoded, matched by `id`, and resolved

### 5.5 WebSocket Transport

Similar to TCP but message boundaries are already handled by the WS protocol.

- **Server**: registers `message` event on `ws.WebSocket.Server`; per-connection handler
- **Client**: single `ws.WebSocket` connection; same pending-request `Map` approach as TCP
- Supports **notifications** from server → client (one-way push) in addition to request-response

---

## 6. Typed Client Proxy

`packages/core/src/client.ts`

### 6.1 Proxy Mechanics

`createClient<TRouter>(transport)` returns a `Proxy` object. Every property access on the proxy returns an async function that:
1. Generates a unique numeric `id` (monotonically increasing counter)
2. Constructs the request object (`JsonRpcRequest2` shape by default)
3. Serializes with `JSON.stringify`
4. Calls `transport.send(message)` and awaits the raw response string
5. Parses the response with `JSON.parse`
6. Returns `response.result` or throws a `JsonRpcError` if `response.error` is set

TypeScript types the proxy as:

```ts
type ClientProxy<TRouter> = {
  [K in keyof TRouter]: (
    params: InferRouterInput<TRouter>[K]
  ) => Promise<InferRouterOutput<TRouter>[K]>;
} & BatchHelper<TRouter>;
```

### 6.2 Batch Client

`client.$batch([...calls])` collects multiple requests into a single JSON array and sends them in one transport round-trip. It resolves with an array of results in the same order.

`client.$prepare.methodName(params)` builds a pending call descriptor without sending it — used to construct batch arrays.

### 6.3 Pending Request Map

For streaming transports (TCP, WS) where many requests may be in flight simultaneously, the client maintains:

```ts
Map<JsonRpcId, {
  resolve: (result: unknown) => void;
  reject: (error: JsonRpcError) => void;
  timer: NodeJS.Timeout; // optional timeout
}>
```

HTTP transport does not need this map because `fetch` handles request-response correlation natively.

---

## 7. Framework Adapters

Adapters are thin wrappers that:
1. Extract the raw body from the framework's request object
2. Call `server.handle()` (via `parseMessage` + dispatch)
3. Write the response back in the framework's way

### 7.1 Express

`jsonRpcExpress(server: JsonRpcServer, opts?): RequestHandler`

Requires `express.json()` (or equivalent body-parser) to be mounted before this handler. The adapter reads `req.body` (already parsed), re-serializes to string, calls `server.handle()`, and sends `res.json(response)`.

### 7.2 Fastify

`jsonRpcFastify(server: JsonRpcServer, opts?): FastifyPluginAsync`

Registers a POST route at `opts.path ?? '/'`. Reads `request.body`, dispatches, replies with `reply.send(response)`. Fastify parses JSON bodies by default.

### 7.3 NestJS

Three parts:

| File | Purpose |
|------|---------|
| `decorator.ts` | `@JsonRpcHandler('method', { input?, output? })` — method decorator that registers metadata on the class method |
| `service.ts` | `JsonRpcService` — `@Injectable()` that holds a `JsonRpcServer` instance; scans decorated methods on `onModuleInit` |
| `module.ts` | `JsonRpcModule.forRoot(opts)` — dynamic module; creates a NestJS controller with a `@Post(opts.path)` handler that delegates to `JsonRpcService` |

The NestJS adapter uses **reflect-metadata** to store and read decorator metadata (`Reflect.defineMetadata` / `Reflect.getMetadata`). It discovers all `@JsonRpcHandler`-decorated methods during module initialization via `ModuleRef`.

### 7.4 Generic Adapter Interface

`packages/core/src/adapter.ts` exposes three exports that allow anyone to integrate jsontpc with **any** HTTP framework — not only the three first-party adapters.

#### Two integration paths

**Path 1 — Function factory (simplest)**

```ts
import { createRequestHandler } from '@jsontpc/core';

const handle = createRequestHandler(server);
// handle: (rawBody: string, context?: unknown) => Promise<string | null>

// null means the request was a notification — send no response (HTTP 204)
app.post('/rpc', async (req, res) => {
  const body = await readBody(req);        // your framework
  const responseBody = await handle(body);
  if (responseBody === null) { res.status(204).end(); return; }
  res.header('Content-Type', 'application/json').send(responseBody);
});
```

`createRequestHandler` **never throws** — parse errors and invalid requests are converted into serialized JSON-RPC error responses before they reach your route handler.

**Path 2 — OOP interface (structured adapter packages)**

```ts
import { IFrameworkAdapter, bindAdapter } from '@jsontpc/core';

class MyAdapter implements IFrameworkAdapter<MyRequest, MyResponse> {
  extractBody(req: MyRequest): string | Promise<string> {
    return req.text();   // read raw body as string
  }
  writeResponse(res: MyResponse, body: string | null): void {
    if (body === null) { res.status(204).end(); return; }
    res.header('Content-Type', 'application/json').send(body);
  }
}

// bindAdapter wires extractBody + createRequestHandler + writeResponse together
const rpcHandler = bindAdapter(server, new MyAdapter());
// rpcHandler: (req: MyRequest, res: MyResponse, context?: unknown) => Promise<void>
```

`bindAdapter` is the implementation contract for all first-party adapter packages (`@jsontpc/express`, `@jsontpc/fastify`, `@jsontpc/nestjs`). Third-party adapters should use the same API.

#### Data flow

```
Framework request
       │
       ▼
 IFrameworkAdapter.extractBody(req) → raw JSON string
       │
       ▼
 createRequestHandler (internal)
   ├─ parseMessage()         — may produce PARSE_ERROR / INVALID_REQUEST
   ├─ server.handle()        — dispatch, validate, call handler
   │   or server.handleBatch()
   └─ serializeResponse()    — produce JSON string (or null for notifications)
       │
       ▼
 IFrameworkAdapter.writeResponse(res, body | null)
       │
       ▼
 Framework response
```

#### `writeResponse` and notifications

When `body` is `null` the request was a notification (or an all-notification batch). The adapter should send a response with no body — HTTP 204 is the conventional choice. The spec says the server MUST NOT reply to notifications, so writing an empty `200` body is also acceptable.

---

## 8. Error Handling

All errors surface as `JsonRpcError` instances (extends `Error`):

```ts
class JsonRpcError extends Error {
  constructor(
    message: string,
    public readonly code: number,  // standard or app-defined
    public readonly data?: unknown
  )
}
```

Standard codes are exported as a `const enum ErrorCode`:

```
PARSE_ERROR      = -32700
INVALID_REQUEST  = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS   = -32602
INTERNAL_ERROR   = -32603
```

Handler errors that are **not** `JsonRpcError` instances are wrapped in an `INTERNAL_ERROR(-32603)` response. The original error message is included in `data.cause` in development mode only (controlled by `NODE_ENV`).

Zod validation errors produce `INVALID_PARAMS(-32602)` responses. The Zod `ZodError` issues array is passed as `data` so the client has field-level detail.

---

## 9. Package Layout & Build

```
jsontpc-workspace/              ← monorepo root (private, not published)
  packages/
    core/                       ← @jsontpc/core
      src/
        types.ts
        errors.ts
        protocol.ts
        router.ts
        server.ts
        client.ts
        adapter.ts              ← IFrameworkAdapter, createRequestHandler, bindAdapter
        index.ts                ← barrel re-export
      tests/unit/
        protocol.test.ts
        server.test.ts
        router.test.ts
        adapter.test.ts
      dist/                     ← generated by tsup (gitignored)
    http/                       ← @jsontpc/http
      src/
        server.ts
        client.ts
        index.ts
      tests/integration/
        http.test.ts
    tcp/                        ← @jsontpc/tcp
      src/
        server.ts
        client.ts
        framing.ts
        index.ts
      tests/integration/
        tcp.test.ts
    ws/                         ← @jsontpc/ws
      src/
        server.ts
        client.ts
        index.ts
      tests/integration/
        ws.test.ts
    express/                    ← @jsontpc/express
      src/
        index.ts
      tests/integration/
        express.test.ts
    fastify/                    ← @jsontpc/fastify
      src/
        index.ts
      tests/integration/
        fastify.test.ts
    nestjs/                     ← @jsontpc/nestjs
      src/
        module.ts
        decorator.ts
        service.ts
        index.ts
      tests/integration/
        nestjs.test.ts
  docs/
    ARCHITECTURE.md
    TODO.md
  examples/                    ← runnable tsx scripts (one sub-folder per package)
    core/
      basic-router.ts
      zod-validation.ts
      notifications.ts
      batch.ts
      custom-adapter.ts
    http/
    tcp/
    ws/
    express/
    fastify/
    nestjs/
  AGENTS.md
  README.md
  package.json                  ← private workspace root
  tsconfig.json                 ← thin root, extends tsconfig.base.json
  tsconfig.base.json            ← shared compiler options
  pnpm-workspace.yaml
  turbo.json
  biome.json
  lefthook.yml
```

**Build tool:** `tsup` (per package)
- Each `packages/*/tsup.config.ts` has a single entry `src/index.ts`
- Output formats: `esm`, `cjs`; `.d.ts` + `.d.cts` generated for all entries
- Each `packages/*/package.json` exports map points to the package's own `dist/` outputs
- **Turborepo** orchestrates builds in dependency order: `@jsontpc/core` is built first
  (all other packages declare `dependsOn: ["^build"]`); subsequent builds are cached

**Test tool:** `vitest` with `@vitest/coverage-v8` (per package, `passWithNoTests: true` during scaffold)

**Cross-package imports** use the npm package name resolved via `workspace:*`:
```ts
import { JsonRpcServer } from '@jsontpc/core';
```

**Within-package imports** use explicit `.js` extensions (NodeNext resolution):
```ts
import { JsonRpcError } from './errors.js';
```

---

## 10. Design Decisions & Trade-offs

| Decision | Rationale |
|----------|-----------|
| Zero core runtime deps | Core is usable in any environment (edge, Deno, Bun) without pulling transitive deps |
| Zod as peer dep | Not forced on users who don't want validation; schema validation is opt-in per procedure |
| Separate npm packages (`@jsontpc/*`) | Users install only what they need (`@jsontpc/core @jsontpc/http`); no ws/NestJS code in an Express app; independent versioning per package |
| NDJSON as default TCP framing | Simple, human-readable, widely understood; easily swapped via `IFramer` |
| Proxy-based typed client | No code generation step; types are inferred directly from the router definition at the call site |
| `Promise.all` for batch | Spec says server MAY process concurrently — parallel is always at least as fast as sequential |
| 1.0 + 2.0 auto-detection | Allows mixed deployments during migrations; detection is unambiguous (presence of `"jsonrpc"` field) |
| Output validation optional | Input validation is a security boundary; output validation is a developer-experience tool — made opt-in to avoid production overhead |
| `NODE_ENV` guards on error details | Prevents internal stack traces from leaking to clients in production (OWASP A05: Security Misconfiguration) |
| `IFrameworkAdapter` + `createRequestHandler` in core | Framework adapter authors only implement `extractBody` / `writeResponse`; dispatch, framing, and error handling live in core — no duplication across adapter packages |
| `bindAdapter` as the single wiring point | All first-party and third-party adapters use the same integration contract — behaviour is consistent and the dispatch loop is never reimplemented |

---

## 11. Typed Context — Planned (v0.2)

> **🗓 Planned (v0.2)** — This section describes a feature that has not yet been implemented.
> Design is final; implementation will begin after v0.1.0 is published (Phase 5 complete).

Today `HandlerContext.context` is typed as `unknown`, requiring manual casts inside every handler. v0.2 threads an optional `TContext` generic through the procedure builder, router, server, and adapter layers so that context is fully type-safe end-to-end with zero breaking changes.

### 11.1 `createProcedure` Factory

A new `createProcedure<TContext>()` factory returns a `ProcedureBuilder<unknown, unknown, TContext>`:

```ts
import { createProcedure, createRouter, JsonRpcServer } from '@jsontpc/core';

interface MyContext {
  userId: string;
  role: 'admin' | 'user';
}

const p = createProcedure<MyContext>();

const router = createRouter({
  whoAmI: p.handler(({ context }) => {
    // context: MyContext — fully typed, no cast needed
    return { id: context.userId, role: context.role };
  }),
});
```

The existing `procedure` singleton is unchanged — it is equivalent to `createProcedure<unknown>()` and continues to work without modification.

### 11.2 `JsonRpcServer` TContext Generic

`JsonRpcServer` gains a second optional generic `TContext = unknown`:

```ts
const server = new JsonRpcServer<typeof router, MyContext>(router);
// server.handle(req, context: MyContext)  ← type-safe
// server.handleBatch(batch, context: MyContext)
```

When `TContext` is omitted the server behaves exactly as before.

### 11.3 Adapter Context Generics

`createRequestHandler` and `bindAdapter` gain matching optional context generics:

```ts
const handle = createRequestHandler<MyContext>(server);
// (rawBody: string, context?: MyContext) => Promise<string | null>

const rpcHandler = bindAdapter<MyReq, MyRes, MyContext>(server, adapter);
// (req: MyReq, res: MyRes, context?: MyContext) => Promise<void>
```

All generic parameters default to `unknown` — no change at call sites that do not opt in.

---

## 12. Middleware Pipeline — Planned (v0.2)

> **🗓 Planned (v0.2)** — This section describes a feature that has not yet been implemented.

Middleware intercepts every dispatch cycle. It is composable (multiple middleware can be stacked), reusable, and strongly typed via the `TContext` generic introduced in Section 11.

### 12.1 `MiddlewareContext` & `MiddlewareFn`

Defined in the new `packages/core/src/middleware.ts`:

```ts
interface MiddlewareContext<TContext = unknown> {
  method: string;        // name of the procedure being dispatched
  rawParams: unknown;    // params before input-schema validation
  context: TContext;     // mutable — middleware may enrich or replace this
  result?: unknown;      // set after the handler returns (post-middleware can read it)
  error?: JsonRpcError;  // set if the handler or an earlier middleware threw
}

type MiddlewareFn<TContext = unknown> =
  (ctx: MiddlewareContext<TContext>, next: () => Promise<void>) => Promise<void>;
```

### 12.2 Global Middleware

Global middleware is registered on the server instance and runs for **every** procedure:

```ts
server.use(async (ctx, next) => {
  // Pre-handler: auth, rate limiting, logging
  if (!isAuthorized(ctx.context)) {
    throw new JsonRpcError('Unauthorized', -32001);
  }
  await next();
  // Post-handler: response logging, metrics
  console.log(`${ctx.method} → ok`);
});
```

### 12.3 Per-Procedure Middleware

Per-procedure middleware is chained on the builder and runs only for that procedure:

```ts
const p = createProcedure<MyContext>();

const router = createRouter({
  adminOnly: p
    .use(async (ctx, next) => {
      if (ctx.context.role !== 'admin') {
        throw new JsonRpcError('Forbidden', -32003);
      }
      await next();
    })
    .input(schema)
    .handler(fn),
});
```

`.use()` may be called multiple times; middleware is composed left-to-right.

### 12.4 Execution Order

```
Incoming request
  │
  ├─ global middleware 1
  │    ├─ global middleware 2
  │    │    ├─ per-procedure middleware 1
  │    │    │    ├─ per-procedure middleware 2
  │    │    │    │    ├─ inputSchema.parse(rawParams)
  │    │    │    │    ├─ handler({ input, context })
  │    │    │    │    └─ outputSchema.parse(result)  [dev only]
  │    │    │    └─ ← post (procedure 2)
  │    │    └─ ← post (procedure 1)
  │    └─ ← post (global 2)
  └─ ← post (global 1)
```

If any middleware throws a `JsonRpcError`, subsequent middleware and the handler are skipped and the error is returned to the caller. Throwing a plain `Error` produces an `INTERNAL_ERROR(-32603)` (same wrapping rules as handler errors, including the `NODE_ENV` production guard).

---

## 13. Pub/Sub & Event Bus — Planned (v0.2)

> **🗓 Planned (v0.2)** — This section describes a feature that has not yet been implemented.
> Prerequisite: Phase 3 WebSocket transport must be complete before WS pub/sub can be added.
> TCP pub/sub can be implemented independently.

v0.2 adds first-class support for server-to-client push notifications. The design layers cleanly on top of existing transport and server primitives:

- **`IPubSubTransport`** and **`IEventBus`** interfaces live in `@jsontpc/core` (keeps the core lean; other packages type-check against them without new deps)
- Concrete implementations (`PubSubServer`, `SubscriptionRegistry`, `PollingAdapter`, `EventBus`) live in the new **`@jsontpc/pubsub`** package
- Transports that support persistent connections (`@jsontpc/tcp`, `@jsontpc/ws`) implement `IPubSubTransport`; HTTP transports fall back to polling

### 13.1 `IPubSubTransport` Interface

Defined in `packages/core/src/pubsub.ts`:

```ts
interface IPubSubTransport extends IServerTransport {
  readonly supportsPush: true;   // type discriminant — duck-typeable
  sendToConnection(connectionId: string, message: string): Promise<void>;
  onConnection(handler: (connectionId: string) => void): void;
  onDisconnect(handler: (connectionId: string) => void): void;
}
```

`TcpServerTransport` and `WsServerTransport` will implement `IPubSubTransport`. HTTP transports do not — `PubSubServer` detects this at construction time and activates `PollingAdapter`.

### 13.2 `PubSubServer`

`PubSubServer<TRouter, TContext>` wraps an existing `JsonRpcServer` and an `IPubSubTransport` (or any `IServerTransport` for the polling path):

```ts
import { PubSubServer } from '@jsontpc/pubsub';

const pubsub = new PubSubServer(server, transport);
await pubsub.listen(4000);

// Publish to all subscribers of a topic
await pubsub.publish('prices.updated', { symbol: 'BTC', price: 65000 });

// Broadcast a notification to every connected client
await pubsub.broadcast('system.maintenance', { message: 'Back in 5 min' });
```

`PubSubServer` automatically registers two built-in procedures on the underlying `JsonRpcServer`:

| Method | Params | Description |
|--------|--------|-------------|
| `rpc.subscribe` | `{ topic: string }` | Subscribe the connection to a topic |
| `rpc.unsubscribe` | `{ topic: string }` | Unsubscribe from a topic |

### 13.3 Polling Fallback

When the transport does not implement `IPubSubTransport`, `PubSubServer` activates the built-in `PollingAdapter`:

- Each connection (identified by a request-scoped token) gets a ring buffer of pending notifications
- A third built-in procedure `rpc.poll` is registered; the client calls it periodically
- `rpc.poll` returns `{ notifications: Array<{ topic: string; params: unknown }> }` and clears the buffer
- Buffer is configurable: `maxBuffer` (default 100 items) and `ttlMs` (default 60 000 ms)

### 13.4 PubSub Client

`createPubSubClient<TRouter>(transport)` wraps `createClient<TRouter>` and adds subscription helpers:

```ts
import { createPubSubClient } from '@jsontpc/pubsub';

const client = createPubSubClient<typeof router>(transport);

// Subscribe — uses transport.onMessage for WS/TCP, auto-polls for HTTP
await client.$subscribe('prices.updated', (params) => {
  console.log('price update:', params);
});

// Unsubscribe from a single topic
await client.$unsubscribe('prices.updated');

// Unsubscribe from all topics and stop any polling loops
await client.$unsubscribeAll();
```

All existing methods on the typed proxy (`client.myMethod(params)`) continue to work unchanged.

### 13.5 `IEventBus` & `EventBus`

For intra-server communication, a typed event bus can be injected via context:

```ts
import { EventBus } from '@jsontpc/pubsub';

interface AppEvents {
  'order.placed': { orderId: string; amount: number };
  'user.created': { userId: string };
}

// Create once, pass via context
const bus = new EventBus<AppEvents>();

bus.on('order.placed', ({ orderId }) => console.log('new order', orderId));

// Inside a handler:
handler: ({ context }) => {
  context.bus.emit('order.placed', { orderId: '123', amount: 99 });
}
```

`EventBus` is **not** a singleton — create one per application and pass it via the typed context (see Section 11). This keeps the server stateless and testable.

### 13.6 Wire Protocol

All pub/sub messages use standard JSON-RPC 2.0 wire format — no new framing or protocol extensions.

| Direction | Shape | Description |
|-----------|-------|-------------|
| Client → Server | `{ jsonrpc: "2.0", method: "rpc.subscribe", params: { topic }, id }` | Subscribe request (expects response) |
| Client → Server | `{ jsonrpc: "2.0", method: "rpc.unsubscribe", params: { topic }, id }` | Unsubscribe request |
| Client → Server | `{ jsonrpc: "2.0", method: "rpc.poll", id }` | Poll request (HTTP fallback only) |
| Server → Client | `{ jsonrpc: "2.0", method: topic, params: data }` | Push notification (no `id` — standard JSON-RPC notification) |

### 13.7 Package Layout (v0.2)

```
packages/
  core/
    src/
      pubsub.ts           ← IPubSubTransport, IEventBus interfaces (new)
      middleware.ts       ← MiddlewareContext, MiddlewareFn (new)
      ... (existing files unchanged)
  pubsub/                 ← @jsontpc/pubsub (new package)
    src/
      registry.ts         ← SubscriptionRegistry
      server.ts           ← PubSubServer
      polling.ts          ← PollingAdapter
      client.ts           ← createPubSubClient
      event-bus.ts        ← EventBus<TEvents>
      index.ts
    tests/integration/
      pubsub.test.ts
```

```
┌──────────────────────────────────────────────────────────────────┐
│                       Application Code                           │
└────────────────────────┬─────────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────────┐
│                          CORE                                    │
│  types · errors · protocol · router · server · client · adapter  │
│  middleware.ts  (MiddlewareFn, MiddlewareContext)                 │
│  pubsub.ts      (IPubSubTransport, IEventBus)       (v0.2 new)  │
└────────┬──────────────────────────────────┬──────────────────────┘
         │ IServerTransport / IPubSubTransport│ IClientTransport
┌────────▼────────┐                ┌─────────▼──────────────────┐
│  Server         │                │  Client                    │
│  Transports     │                │  Transports                │
│  http · tcp · ws│                │  http · tcp · ws           │
└────────┬────────┘                └─────────┬──────────────────┘
         │                                   │
┌────────▼───────────────────────────────────▼──────────────────┐
│                  @jsontpc/pubsub  (v0.2 new)                   │
│  PubSubServer · SubscriptionRegistry · PollingAdapter          │
│  createPubSubClient · EventBus                                 │
└────────────────────────────────────────────────────────────────┘
         │
┌────────▼──────────────────────────────────────────────────────┐
│                   Framework Adapters                           │
│               express · fastify · nestjs                       │
└───────────────────────────────────────────────────────────────┘
```

---

## 14. Examples

Runnable examples live in `examples/` at the monorepo root. Each sub-folder maps to a package.

| Script (from monorepo root) | What it demonstrates |
|---|---|
| `pnpm --filter jsontpc-examples core:basic` | `createRouter` + `server.handle()` with no transport |
| `pnpm --filter jsontpc-examples core:zod-validation` | Zod `.input()`/`.output()` — valid + invalid call |
| `pnpm --filter jsontpc-examples core:notifications` | v1 + v2 notifications; `undefined` return |
| `pnpm --filter jsontpc-examples core:batch` | `handleBatch` — concurrent, mixed, all-notification |
| `pnpm --filter jsontpc-examples core:custom-adapter` | `IFrameworkAdapter` + `bindAdapter` with `node:http` |

Examples are plain TypeScript files executed with [`tsx`](https://github.com/privatenumber/tsx). They are not compiled by `tsup`, not part of the `turbo` pipeline, and not published to npm.
