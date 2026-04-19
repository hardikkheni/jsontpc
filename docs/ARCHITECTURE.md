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
11. [Plugin System — Planned (v0.2)](#11-plugin-system--planned-v02)
    - [Why a Plugin System](#111-why-a-plugin-system)
    - [IServerPlugin Interface](#112-iservertplugin-interface)
    - [JsonRpcServer Plugin API](#113-jsonrpcserver-plugin-api)
    - [rpc.* Namespace](#114-rpc-namespace)
    - [Built-in Plugins](#115-built-in-plugins)
    - [Third-Party Plugins](#116-third-party-plugins)
12. [Typed Context — Planned (v0.2)](#12-typed-context--planned-v02)
    - [createProcedure Factory](#121-createprocedure-factory)
    - [JsonRpcServer TContext Generic](#122-jsonrpcserver-tcontext-generic)
    - [Adapter Context Generics](#123-adapter-context-generics)
13. [Middleware Pipeline — Planned (v0.2)](#13-middleware-pipeline--planned-v02)
    - [MiddlewareContext & MiddlewareFn](#131-middlewarecontext--middlewarefn)
    - [Global Middleware](#132-global-middleware)
    - [Per-Procedure Middleware](#133-per-procedure-middleware)
    - [Execution Order](#134-execution-order)
14. [Pub/Sub & Event Bus — Planned (v0.2)](#14-pubsub--event-bus--planned-v02)
    - [IPubSubTransport Interface](#141-ipubsubtransport-interface)
    - [PubSubServer](#142-pubsubserver)
    - [Polling Fallback](#143-polling-fallback)
    - [PubSub Client](#144-pubsub-client)
    - [IEventBus & EventBus](#145-ieventbus--eventbus)
    - [Wire Protocol](#146-wire-protocol)
    - [Package Layout (v0.2)](#147-package-layout-v02)
15. [Examples](#15-examples)

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
│  plugin.ts (IServerPlugin) · plugins/ (built-ins)       │
│                                                          │
│  • Zero runtime dependencies                             │
│  • Zod only used when .input()/.output() called          │
│  • Works in any JS environment                           │
└────────┬──────────────────────┬──────────────────────────┘
         │ IServerTransport     │ server.register(plugin)
         │ IClientTransport     │
┌────────▼────────┐    ┌────────▼─────────────────────────┐
│  Transports     │    │  Plugins                         │
│  Server+Client  │    │  IntrospectionPlugin             │
│  http · tcp · ws│    │  HealthPlugin                    │
└────────┬────────┘    │  PubSubServer (@jsontpc/pubsub)  │
         │             │  … third-party …                 │
         │             └──────────────────────────────────┘
┌────────▼──────────────────────────────────────────────┐
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
  │    ├─ found in user router → use it  (user is always authoritative)
  │    ├─ found in plugin registry → use it
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

### 4.4 Plugin API

`JsonRpcServer` exposes two methods exclusively for plugin authors:

```ts
/** Install a plugin. Calls plugin.install(this) and returns `this` for chaining. */
register(plugin: IServerPlugin): this;

/** Register a procedure from a plugin. Throws if the name is already registered. */
registerProcedure(name: string, def: ProcedureDef<unknown, unknown>): void;
```

`register()` calls `plugin.install(this)` synchronously and returns `this`, enabling fluent chaining:

```ts
const server = new JsonRpcServer(router)
  .register(new IntrospectionPlugin())
  .register(new HealthPlugin());
```

`registerProcedure()` adds the procedure to an internal `Map<string, ProcedureDef>` that is separate from the user router. **It throws if the name is already registered** — collisions between plugins are always bugs, not an overridable configuration.

> **Note:** `register()` and `registerProcedure()` are intended for plugin authors, not application code. All user-defined procedures belong in `createRouter()`.

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

**Connection identity:** `TcpServerTransport` assigns each accepted socket a unique `connectionId` (UUID v4) and passes it as part of the context when calling `server.handle(req, { connectionId })`. Plugin procedures (such as `rpc.subscribe` from `@jsontpc/pubsub`) rely on this `connectionId` to track per-connection subscriptions and route push notifications. With Phase 7 typed context you can declare `TContext = { connectionId: string } & MyAppContext` to merge transport-provided and application-level context.

### 5.5 WebSocket Transport

Similar to TCP but message boundaries are already handled by the WS protocol.

- **Server**: registers `message` event on `ws.WebSocket.Server`; per-connection handler
- **Client**: single `ws.WebSocket` connection; same pending-request `Map` approach as TCP
- Supports **notifications** from server → client (one-way push) in addition to request-response

**Connection identity:** `WsServerTransport` assigns each WebSocket connection a unique `connectionId` (UUID v4) and passes it as context on every `server.handle()` call — identical in shape to `TcpServerTransport`. This enables plugins to maintain per-connection subscription state for server-push scenarios.

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
        plugin.ts               ← IServerPlugin interface  (v0.2 new)
        plugins/
          introspection.ts      ← IntrospectionPlugin (rpc.describe)  (v0.2 new)
          health.ts             ← HealthPlugin (rpc.ping)  (v0.2 new)
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
| Plugin system (`IServerPlugin`) | Features like pub/sub, introspection, and health checks need to register procedures but must not live in core. A single-method interface keeps the extension contract minimal; independent package versioning follows naturally; `register()` chains fluently and `registerProcedure()` fails fast on collisions |

---

## 11. Plugin System — Planned (v0.2)

> **🗓 Planned (v0.2)** — This section describes a feature that has not yet been implemented.
> Design is final; implementation will begin after v0.1.0 is published (Phase 5 complete).

### 11.1 Why a Plugin System

`JsonRpcServer` is a pure dispatch engine. Features like pub/sub, schema introspection, and health checks are orthogonal — they need to register procedures but have no reason to live in core, and bloating core would violate the zero-dependency policy and force irrelevant code on every user.

The plugin system solves this with a single-method interface. Any package — first-party or third-party — that wants to inject procedures into a server implements `IServerPlugin` and calls `server.register(plugin)`.

**Why it makes sense:**

| Argument | Detail |
|----------|--------|
| Orthogonality | Pub/sub, health, auth, metrics are side concerns — don't belong in the dispatch engine |
| Single contract | `IServerPlugin` is one method; zero friction for third-party plugin authors |
| No alternatives needed | Without this, users must call `registerProcedure()` manually or wrap the server class |
| Independent versioning | `@jsontpc/pubsub@2` can ship without bumping `@jsontpc/core` |
| Familiar pattern | Mirrors Fastify plugins and Express middleware — a known composition model for Node.js developers |
| Correct IoC | Plugin receives the server via `install()`, not the constructor — no side effects on `new` |

### 11.2 `IServerPlugin` Interface

Defined in `packages/core/src/plugin.ts`:

```ts
interface IServerPlugin {
  /**
   * Called by JsonRpcServer.register(). Store the server reference, register
   * procedures, and wire any transport event handlers here.
   */
  install(server: JsonRpcServer): void;
}
```

The interface is intentionally minimal. Plugins are named by their role, not by convention (e.g. `PubSubServer`, `HealthPlugin`) — the interface is the only contract.

### 11.3 `JsonRpcServer` Plugin API

See also [§4.4 Plugin API](#44-plugin-api).

```ts
// Install a plugin — calls plugin.install(this), returns this for chaining
server.register(plugin: IServerPlugin): this

// Register a single procedure from inside install()
server.registerProcedure(name: string, def: ProcedureDef<unknown, unknown>): void
```

**Dispatch order** (see also §4.1): user router procedures are checked first (user is always authoritative); plugin-registered procedures are checked second. A user can deliberately shadow a plugin procedure by defining one with the same name in their router.

**Collision guard:** `registerProcedure()` throws a `TypeError` if the name is already taken by another plugin procedure. This is intentional — plugin conflicts are bugs, not configuration.

### 11.4 `rpc.*` Namespace

All first-party plugins register methods under the `rpc.*` prefix. This namespace is reserved:

- User routers **must not** define procedures whose names start with `rpc.`
- In development mode (`NODE_ENV !== 'production'`), `JsonRpcServer` emits a console warning if a user router procedure name collides with the `rpc.*` namespace

Third-party plugins may use any other prefix (e.g. `ext.myFeature`).

### 11.5 Built-in Plugins

Two plugins ship inside `@jsontpc/core` — they are tiny, have no extra dependencies, and are immediately useful to every user.

| Class | Package | Procedure | Response |
|-------|---------|-----------|----------|
| `IntrospectionPlugin` | `@jsontpc/core` | `rpc.describe` | `{ methods: string[]; schemas: Record<string, { input?, output? }> }` — the router's method names and JSON Schema shapes of their input/output |
| `HealthPlugin` | `@jsontpc/core` | `rpc.ping` | `{ ok: true; uptime: number }` — useful for load-balancer / readiness probes |

Usage:

```ts
import { JsonRpcServer, IntrospectionPlugin, HealthPlugin } from '@jsontpc/core';

const server = new JsonRpcServer(router)
  .register(new IntrospectionPlugin())
  .register(new HealthPlugin());
```

### 11.6 Third-Party Plugins

Any package can implement `IServerPlugin`. Possible ecosystem plugins (not shipped by this repo):

| Plugin | What it does |
|--------|-------------|
| `RateLimitPlugin` | Tracks call frequency per `connectionId` / IP; throws a custom error code on overflow |
| `AuthPlugin` | Registers `rpc.auth` + pre-dispatch token validation via Phase 8 middleware |
| `CachePlugin` | TTL memoization keyed on method name + serialised params |
| `LoggingPlugin` | Structured per-request logs (pre/post via Phase 8 middleware) |
| `MetricsPlugin` | Prometheus / OTEL counters per method |
| `TracingPlugin` | OTEL span per RPC call |

Third-party plugins are published to npm independently and installed like any other package. They interact with `JsonRpcServer` only via the stable `IServerPlugin` interface.

---

## 12. Typed Context — Planned (v0.2)

> **🗓 Planned (v0.2)** — This section describes a feature that has not yet been implemented.
> Design is final; implementation will begin after v0.1.0 is published (Phase 5 complete).

Today `HandlerContext.context` is typed as `unknown`, requiring manual casts inside every handler. v0.2 threads an optional `TContext` generic through the procedure builder, router, server, and adapter layers so that context is fully type-safe end-to-end with zero breaking changes.

### 12.1 `createProcedure` Factory

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

### 12.2 `JsonRpcServer` TContext Generic

`JsonRpcServer` gains a second optional generic `TContext = unknown`:

```ts
const server = new JsonRpcServer<typeof router, MyContext>(router);
// server.handle(req, context: MyContext)  ← type-safe
// server.handleBatch(batch, context: MyContext)
```

When `TContext` is omitted the server behaves exactly as before.

### 12.3 Adapter Context Generics

`createRequestHandler` and `bindAdapter` gain matching optional context generics:

```ts
const handle = createRequestHandler<MyContext>(server);
// (rawBody: string, context?: MyContext) => Promise<string | null>

const rpcHandler = bindAdapter<MyReq, MyRes, MyContext>(server, adapter);
// (req: MyReq, res: MyRes, context?: MyContext) => Promise<void>
```

All generic parameters default to `unknown` — no change at call sites that do not opt in.

---

## 13. Middleware Pipeline — Planned (v0.2)

> **🗓 Planned (v0.2)** — This section describes a feature that has not yet been implemented.

Middleware intercepts every dispatch cycle. It is composable (multiple middleware can be stacked), reusable, and strongly typed via the `TContext` generic introduced in Section 12.

### 13.1 `MiddlewareContext` & `MiddlewareFn`

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

### 13.2 Global Middleware

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

### 13.3 Per-Procedure Middleware

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

### 13.4 Execution Order

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

## 14. Pub/Sub & Event Bus — Planned (v0.2)

> **🗓 Planned (v0.2)** — This section describes a feature that has not yet been implemented.
> Prerequisite: Phase 3 WebSocket transport must be complete before WS pub/sub can be added.
> TCP pub/sub can be implemented independently.

v0.2 adds first-class support for server-to-client push notifications. The design layers cleanly on top of existing transport and server primitives:

- **`IPubSubTransport`** and **`IEventBus`** interfaces live in `@jsontpc/core` (keeps the core lean; other packages type-check against them without new deps)
- Concrete implementations (`PubSubServer`, `SubscriptionRegistry`, `PollingAdapter`, `EventBus`) live in the new **`@jsontpc/pubsub`** package
- Transports that support persistent connections (`@jsontpc/tcp`, `@jsontpc/ws`) implement `IPubSubTransport`; HTTP transports fall back to polling
- Topic→payload mappings are **fully type-safe**: declare a `TTopics` interface once; every `publish`, `broadcast`, `$subscribe`, and `rpc.poll` payload is inferred from it at compile time

### 14.0 Typed Topics

All pub/sub APIs accept an optional `TTopics extends PubSubTopics` generic parameter
(where `PubSubTopics = Record<string, unknown>`). Declare an interface that maps topic names to
their payload shapes, then thread it through both the server and client:

```ts
import type { PubSubTopics } from '@jsontpc/core';

interface AppTopics extends PubSubTopics {
  'prices.updated': { symbol: string; price: number };
  'order.placed':   { orderId: string; amount: number };
  'system.ping':    Record<string, never>;
}
```

Pass `AppTopics` as the third generic to `PubSubServer` and the second to `createPubSubClient`:

```ts
// Server — publish() and broadcast() are type-checked against AppTopics
const pubsub = new PubSubServer<typeof router, MyContext, AppTopics>(server, transport);

await pubsub.publish('prices.updated', { symbol: 'BTC', price: 65000 }); // ✓
await pubsub.publish('prices.updated', { symbol: 'BTC', price: '65k' }); // ✗ type error

// Client — $subscribe callback parameter is typed from AppTopics
const client = createPubSubClient<typeof router, AppTopics>(transport);
await client.$subscribe('prices.updated', ({ symbol, price }) => {
  //                                         ^^^^^^  ^^^^^  both typed
  console.log(symbol, price);
});
```

When `TTopics` is omitted it defaults to `Record<string, unknown>` — existing untyped code keeps compiling, with `unknown` payloads.

Two utility types are exported from `@jsontpc/core`:

```ts
// Constraint alias — use as the extends clause in your own generic parameters
export type PubSubTopics = Record<string, unknown>;

// Extract the payload type for a specific topic key
export type InferTopicPayload<
  TTopics extends PubSubTopics,
  K extends keyof TTopics & string,
> = TTopics[K];
```

`InferTopicPayload` follows the same ergonomic pattern as `InferProcedureInput` / `InferProcedureOutput` from the router layer.

### 14.1 `IPubSubTransport` Interface

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

### 14.2 `PubSubServer`

`PubSubServer<TTopics extends PubSubTopics = PubSubTopics>` **implements `IServerPlugin`** and holds a reference to an `IPubSubTransport`. It does not own the transport lifecycle and does not have a `listen()` method — the user starts and stops the transport directly.

**Constructor:**

```ts
new PubSubServer<TTopics>(transport: IPubSubTransport)
```

No `TRouter` generic and no `server` argument in the constructor — the server reference is received lazily via `install(server)` when `server.register(pubsub)` is called.

**Usage:**

```ts
import { JsonRpcServer } from '@jsontpc/core';
import { WsServerTransport } from '@jsontpc/ws';
import { PubSubServer } from '@jsontpc/pubsub';
import type { AppTopics } from './topics.js';

const server = new JsonRpcServer(router);
const transport = new WsServerTransport(server);
const pubsub = new PubSubServer<AppTopics>(transport);

server.register(pubsub);   // calls pubsub.install(server) → registers rpc.subscribe etc.
transport.listen(4000);    // user controls the lifecycle

// Later, publish a topic
await pubsub.publish('prices.updated', { symbol: 'BTC', price: 65000 });
await pubsub.broadcast('system.ping', {});
```

The `publish` and `broadcast` method signatures:

```ts
publish<K extends keyof TTopics & string>(
  topic: K,
  data: TTopics[K],
): Promise<void>;

broadcast<K extends keyof TTopics & string>(
  topic: K,
  data: TTopics[K],
): Promise<void>;
```

`PubSubServer.install()` calls `server.registerProcedure()` for each built-in procedure:

| Method | Params | Description |
|--------|--------|-------------|
| `rpc.subscribe` | `{ topic: keyof TTopics & string; sessionId?: string }` | Subscribe the connection (or HTTP session) to a topic |
| `rpc.unsubscribe` | `{ topic: keyof TTopics & string; sessionId?: string }` | Unsubscribe from a topic |

For TCP and WS transports, subscriptions are keyed by the `connectionId` injected into context. For HTTP, subscriptions are keyed by the client-supplied `sessionId` UUID in params (see §14.3).


### 14.3 Polling Fallback

When the transport does not implement `IPubSubTransport` (i.e., HTTP), `PubSubServer` activates the built-in `PollingAdapter`. HTTP has no persistent connection, so the client must supply a stable identity across requests.

**`sessionId`** is a client-generated UUID v4 that the client includes in every `rpc.subscribe`, `rpc.unsubscribe`, and `rpc.poll` params object. This identifies the logical session for the server's per-client notification ring buffer.

- Each session (identified by `sessionId`) gets a ring buffer of pending notifications typed as `TopicNotification<TTopics>`
- `rpc.poll` is registered as a third built-in procedure; the client calls it periodically
- `rpc.poll` params: `{ sessionId: string }` — no topic filter; returns all queued notifications for that session
- `rpc.poll` returns `{ notifications: Array<TopicNotification<TTopics>> }` — a discriminated union keyed on `topic` — and clears the buffer
- Buffer is configurable: `maxBuffer` (default 100 items) and `ttlMs` (default 60 000 ms)
- Sessions with no `rpc.poll` call within `ttlMs` are evicted automatically

`rpc.subscribe` and `rpc.unsubscribe` params for HTTP polling:

```ts
{ topic: keyof TTopics & string; sessionId: string }
```

`TopicNotification<TTopics>` is a mapped discriminated union exported from `@jsontpc/core`:

```ts
// Exported from @jsontpc/core
export type TopicNotification<TTopics extends PubSubTopics> = {
  [K in keyof TTopics & string]: { topic: K; params: TTopics[K] };
}[keyof TTopics & string];
```

Narrowing on `notification.topic` automatically narrows `notification.params` to the correct payload type — no casts needed:

```ts
for (const n of result.notifications) {
  if (n.topic === 'prices.updated') {
    console.log(n.params.price); // typed as number
  }
}
```

### 14.4 PubSub Client

`createPubSubClient<TRouter, TTopics extends PubSubTopics = PubSubTopics>(transport)` wraps `createClient<TRouter>` and adds subscription helpers:

```ts
import { createPubSubClient } from '@jsontpc/pubsub';
import type { AppTopics } from './topics.js';

const client = createPubSubClient<typeof router, AppTopics>(transport);

// $subscribe — callback parameter is typed from AppTopics
await client.$subscribe('prices.updated', ({ symbol, price }) => {
  console.log('price update:', symbol, price);
});

// $unsubscribe — topic is constrained to keyof AppTopics & string
await client.$unsubscribe('prices.updated');

// $unsubscribeAll — stops all subscriptions and any polling loops
await client.$unsubscribeAll();
```

`$subscribe` uses `transport.onMessage` for WS/TCP transports and starts an automatic polling loop (`rpc.poll`) for HTTP transports. All existing typed RPC methods (`client.myMethod(params)`) continue to work unchanged.

Full subscription helper signatures:

```ts
$subscribe<K extends keyof TTopics & string>(
  topic: K,
  callback: (data: TTopics[K]) => void,
): Promise<void>;

$unsubscribe(topic: keyof TTopics & string): Promise<void>;

$unsubscribeAll(): Promise<void>;
```

### 14.5 `IEventBus` & `EventBus`

For intra-server communication, a typed event bus can be injected via context. `IEventBus<TEvents>` uses the same `TEvents extends Record<string, unknown>` pattern as `TTopics` — keys are event names, values are payload shapes:

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

`EventBus` is **not** a singleton — create one per application and pass it via the typed context (see Section 12). This keeps the server stateless and testable.

`IEventBus<TEvents>` interface defined in `packages/core/src/pubsub.ts`:

```ts
interface IEventBus<TEvents extends Record<string, unknown> = Record<string, unknown>> {
  on<K extends keyof TEvents & string>(
    event: K,
    listener: (data: TEvents[K]) => void,
  ): () => void;                                       // returns unsubscribe fn
  off<K extends keyof TEvents & string>(
    event: K,
    listener: (data: TEvents[K]) => void,
  ): void;
  emit<K extends keyof TEvents & string>(
    event: K,
    data: TEvents[K],
  ): void;
}
```

### 14.6 Wire Protocol

All pub/sub messages use standard JSON-RPC 2.0 wire format — no new framing or protocol extensions.
`TTopics` typing is enforced at compile time only; topics travel as plain strings on the wire.

| Direction | Shape | Description |
|-----------|-------|-------------|
| Client → Server | `{ jsonrpc: "2.0", method: "rpc.subscribe", params: { topic }, id }` | Subscribe request via TCP/WS — connection identified by `connectionId` in server context |
| Client → Server | `{ jsonrpc: "2.0", method: "rpc.subscribe", params: { topic, sessionId }, id }` | Subscribe request via HTTP — client UUID `sessionId` identifies the polling session |
| Client → Server | `{ jsonrpc: "2.0", method: "rpc.unsubscribe", params: { topic }, id }` | Unsubscribe via TCP/WS |
| Client → Server | `{ jsonrpc: "2.0", method: "rpc.unsubscribe", params: { topic, sessionId }, id }` | Unsubscribe via HTTP |
| Client → Server | `{ jsonrpc: "2.0", method: "rpc.poll", params: { sessionId }, id }` | Poll request (HTTP fallback only) |
| Server → Client | `{ jsonrpc: "2.0", method: topic, params: data }` | Push notification (no `id` — standard JSON-RPC notification; TCP/WS only) |

### 14.7 Package Layout (v0.2)

```
packages/
  core/
    src/
      pubsub.ts           ← IPubSubTransport, IEventBus, PubSubTopics,
                            TopicNotification, InferTopicPayload  (new)
      middleware.ts       ← MiddlewareContext, MiddlewareFn  (new)
      plugin.ts           ← IServerPlugin  (new)
      plugins/
        introspection.ts  ← IntrospectionPlugin  (new)
        health.ts         ← HealthPlugin  (new)
      ... (existing files unchanged)
  pubsub/                 ← @jsontpc/pubsub (new package)
    src/
      registry.ts         ← SubscriptionRegistry<TTopics>
      server.ts           ← PubSubServer<TTopics> implements IServerPlugin
      polling.ts          ← PollingAdapter<TTopics>
      client.ts           ← createPubSubClient<TRouter, TTopics>
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
│  pubsub.ts      (IPubSubTransport, IEventBus,        (v0.2 new) │
│                  PubSubTopics, TopicNotification,               │
│                  InferTopicPayload)                              │
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
│  PubSubServer<TRouter,TContext,TTopics>                        │
│  SubscriptionRegistry<TTopics> · PollingAdapter<TTopics>       │
│  createPubSubClient<TRouter,TTopics> · EventBus<TEvents>       │
└────────────────────────────────────────────────────────────────┘
         │
┌────────▼──────────────────────────────────────────────────────┐
│                   Framework Adapters                           │
│               express · fastify · nestjs                       │
└───────────────────────────────────────────────────────────────┘
```

---

## 15. Examples

Runnable examples live in `examples/` at the monorepo root. Each sub-folder maps to a package.

| Script (from monorepo root) | What it demonstrates |
|---|---|
| `pnpm --filter jsontpc-examples core:basic` | `createRouter` + `server.handle()` with no transport |
| `pnpm --filter jsontpc-examples core:zod-validation` | Zod `.input()`/`.output()` — valid + invalid call |
| `pnpm --filter jsontpc-examples core:notifications` | v1 + v2 notifications; `undefined` return |
| `pnpm --filter jsontpc-examples core:batch` | `handleBatch` — concurrent, mixed, all-notification |
| `pnpm --filter jsontpc-examples core:custom-adapter` | `IFrameworkAdapter` + `bindAdapter` with `node:http` |

Examples are plain TypeScript files executed with [`tsx`](https://github.com/privatenumber/tsx). They are not compiled by `tsup`, not part of the `turbo` pipeline, and not published to npm.
