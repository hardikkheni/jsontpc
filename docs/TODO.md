# TODO

## Setup: Tooling Scaffold

### Phase 1 — Monorepo Foundation
- [x] Root `package.json` — private workspace root, Turborepo scripts, all devDeps
- [x] `tsconfig.base.json` — strict, ES2022, NodeNext module + resolution
- [x] `tsconfig.json` — thin root wrapper, extends base
- [x] `pnpm-workspace.yaml` — `packages: - packages/*`
- [x] `turbo.json` — build/test/typecheck tasks with `^build` dependency chain
- [x] `biome.json` — lint + format config, `dist/` excluded
- [x] `lefthook.yml` — pre-commit: biome check on staged `packages/**/*.ts`
- [x] `.changeset/config.json` — access: public, baseBranch: main
- [x] `.github/workflows/ci.yml` — typecheck, lint, test, build, publint, attw (Node 18/20/22)
- [x] `.github/workflows/release.yml` — changeset-based publish with provenance
- [x] `.npmrc` — provenance=true, shamefully-hoist=false
- [x] `.gitignore`
- [x] All 7 package scaffolds (`packages/*/package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `src/index.ts`)
- [x] `pnpm install` succeeds
- [x] `pnpm build` exits 0 (7/7 packages via Turborepo)
- [x] `pnpm typecheck` exits 0
- [x] `pnpm test` exits 0
- [x] `pnpm lint` exits 0

### Phase 1 — Manual Steps (one-time)
- [x] Create npm account / organisation (if not done)
- [x] Generate npm **Automation token** → add as `NPM_TOKEN` secret in GitHub repo settings
- [x] Confirm OIDC `id-token: write` is enabled for the repo (already in `release.yml`)

---

## Implementation Phases

### Phase 2 — Core Protocol (`packages/core`)
- [x] `packages/core/src/types.ts`
- [x] `packages/core/src/errors.ts`
- [x] `packages/core/src/protocol.ts`
- [x] `packages/core/src/router.ts`
- [x] `packages/core/src/server.ts`
- [x] `packages/core/src/client.ts`
- [x] `packages/core/src/adapter.ts` — `IFrameworkAdapter`, `createRequestHandler`, `bindAdapter`
- [x] `packages/core/src/index.ts` (replace stub with real barrel)
- [x] `packages/core/tests/unit/protocol.test.ts`
- [x] `packages/core/tests/unit/server.test.ts`
- [x] `packages/core/tests/unit/router.test.ts`
- [x] `packages/core/tests/unit/adapter.test.ts`
- [x] **Examples scaffold** — `examples/package.json`, `examples/tsconfig.json`; add `examples` to `pnpm-workspace.yaml`
- [x] `examples/core/basic-router.ts`
- [x] `examples/core/zod-validation.ts`
- [x] `examples/core/notifications.ts`
- [x] `examples/core/batch.ts`
- [x] `examples/core/custom-adapter.ts`
- [x] `pnpm typecheck` passes
- [x] `pnpm test` passes (all unit tests green)

### Phase 3 — Transports (implement one at a time)

#### HTTP (`packages/http`) — COMPLETE ✅
- [x] `packages/http/src/server.ts` — `HttpServerTransport`
- [x] `packages/http/src/client.ts` — `HttpClientTransport`
- [x] `packages/http/src/index.ts` (replace stub)
- [x] `packages/http/tests/integration/http.test.ts`
- [x] `examples/http/server.ts` — start an HTTP server
- [x] `examples/http/client.ts` — call the server via `HttpClientTransport`

#### TCP (`packages/tcp`)
- [x] `packages/tcp/src/framing.ts` — `IFramer` interface + `NdJsonFramer`
- [x] `packages/tcp/src/server.ts` — `TcpServerTransport`
- [x] `packages/tcp/src/client.ts` — `TcpClientTransport`
- [x] `packages/tcp/src/index.ts` (replace stub)
- [x] `packages/tcp/tests/integration/tcp.test.ts`
- [x] `examples/tcp/server.ts`
- [x] `examples/tcp/client.ts`
- [x] `examples/tcp/custom-framing.ts` — swap `NdJsonFramer` for a custom `IFramer`

#### WebSocket (`packages/ws`)
- [ ] `packages/ws/src/server.ts` — `WsServerTransport`
- [ ] `packages/ws/src/client.ts` — `WsClientTransport`
- [ ] `packages/ws/src/index.ts` (replace stub)
- [ ] `packages/ws/tests/integration/ws.test.ts`
- [ ] `examples/ws/server.ts`
- [ ] `examples/ws/client.ts`

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (all integration tests green)

### Phase 4 — Framework Adapters (implement in any order)

#### Express (`packages/express`)
- [ ] `packages/express/src/index.ts` — `jsonRpcExpress()` middleware factory (uses `bindAdapter` internally)
- [ ] `packages/express/tests/integration/express.test.ts`
- [ ] `examples/express/app.ts`

#### Fastify (`packages/fastify`)
- [ ] `packages/fastify/src/index.ts` — `jsonRpcFastify()` plugin factory (uses `bindAdapter` internally)
- [ ] `packages/fastify/tests/integration/fastify.test.ts`
- [ ] `examples/fastify/app.ts`

#### NestJS (`packages/nestjs`)
- [ ] `packages/nestjs/src/decorator.ts` — `@JsonRpcHandler()` method decorator
- [ ] `packages/nestjs/src/service.ts` — `JsonRpcService` injectable
- [ ] `packages/nestjs/src/module.ts` — `JsonRpcModule.forRoot()` dynamic module
- [ ] `packages/nestjs/src/index.ts` (replace stub)
- [ ] `packages/nestjs/tests/integration/nestjs.test.ts`
- [ ] `examples/nestjs/main.ts` + `examples/nestjs/app.module.ts` + `examples/nestjs/math.service.ts`

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes

### Phase 5 — Polish & Release
- [ ] `pnpm check:publint` — no export map errors for all 7 packages
- [ ] `pnpm check:attw` — types resolve for ESM + CJS consumers in all 7 packages
- [ ] Verify all `packages/*/package.json` exports maps are complete
- [ ] Verify all `packages/*/tsup.config.ts` entries are correct
- [ ] `README.md` install examples use `@jsontpc/*` scoped package names
- [ ] `README.md` API examples match actual exported names
- [ ] Cut first release: `pnpm changeset` → merge "Version Packages" PR → v0.1.0 on npm

---

> ## 🗓 Planned — v0.2
>
> The following phases describe planned features for the v0.2 release.
> They are **not** yet implemented. No code changes should be made to these sections
> until Phases 1–5 are fully complete and v0.1.0 is published.

### Phase 6 — Plugin System 🗓 Planned

> **Goal:** Give `JsonRpcServer` a first-class extension point so that orthogonal features
> (pub/sub, introspection, health checks, rate limiting) can register procedures without
> living in core. Foundation for all subsequent v0.2 phases.

#### `packages/core` — plugin interfaces and built-ins

- [ ] `packages/core/src/plugin.ts` — define and export `IServerPlugin` interface: `{ install(server: JsonRpcServer): void }`
- [ ] `packages/core/src/server.ts` — add `register(plugin: IServerPlugin): this` (calls `plugin.install(this)`, returns `this` for chaining)
- [ ] `packages/core/src/server.ts` — add `registerProcedure(name: string, def: ProcedureDef<unknown, unknown>): void` (throws `TypeError` if name already registered; stores in `Map` separate from user router; user router is always authoritative in dispatch)
- [ ] `packages/core/src/server.ts` — emit dev-mode console warning when a user router procedure name starts with `rpc.`
- [ ] `packages/core/src/plugins/introspection.ts` — `IntrospectionPlugin` class implementing `IServerPlugin`; registers `rpc.describe` procedure returning `{ methods: string[]; schemas: Record<string, { input?, output? }> }`
- [ ] `packages/core/src/plugins/health.ts` — `HealthPlugin` class implementing `IServerPlugin`; registers `rpc.ping` procedure returning `{ ok: true; uptime: number }`
- [ ] `packages/core/src/index.ts` — export `IServerPlugin`, `IntrospectionPlugin`, `HealthPlugin`
- [ ] `packages/core/tests/unit/plugin.test.ts` — new test file:
  - `register()` returns server instance (chainable)
  - `install()` is called synchronously with the server
  - `registerProcedure()` throws on duplicate name
  - Plugin procedure is reachable via `server.handle()`
  - User router procedure shadows same-named plugin procedure
  - Dev-mode warning on `rpc.*` user procedure name
  - `IntrospectionPlugin` returns correct method list
  - `HealthPlugin` returns `{ ok: true, uptime: number }`
- [ ] `packages/core/README.md` — add Plugin System section with usage example for `register()`, `IntrospectionPlugin`, and `HealthPlugin`
- [ ] `docs/ARCHITECTURE.md` — §11 Plugin System updated ✓

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (no regressions)

### Phase 7 — Typed Context 🗓 Planned

> **Goal:** Allow routers and servers to carry a typed `TContext` generic so handlers receive a
> fully-typed `context` argument instead of `unknown`. All changes are backward-compatible —
> existing code continues to compile without modification.

#### `packages/core` — typed context generics

- [ ] `packages/core/src/router.ts` — add optional `TContext = unknown` generic to `ProcedureBuilder<TIn, TOut, TContext>`, `ProcedureDef<TIn, TOut, TContext>`, and `HandlerContext<TIn, TContext>`
- [ ] `packages/core/src/router.ts` — export new factory `createProcedure<TContext>()` → returns `ProcedureBuilder<unknown, unknown, TContext>`; existing `procedure` singleton unchanged
- [ ] `packages/core/src/server.ts` — add optional `TContext = unknown` generic to `JsonRpcServer<TRouter, TContext>`; `handle(req, context?: TContext)` and `handleBatch(requests, context?: TContext)` become type-safe
- [ ] `packages/core/src/adapter.ts` — `createRequestHandler<TContext>(server: JsonRpcServer<Router, TContext>)` and `bindAdapter<TReq, TRes, TContext>(...)` gain optional context generic
- [ ] `packages/core/src/index.ts` — export `createProcedure`
- [ ] `packages/core/tests/unit/router.test.ts` — extend with typed-context test cases
- [ ] `packages/core/tests/unit/server.test.ts` — extend with typed-context test cases
- [ ] `packages/core/tests/unit/adapter.test.ts` — extend with typed-context test cases
- [ ] `packages/core/README.md` — document `createProcedure<TContext>()` usage
- [ ] `docs/ARCHITECTURE.md` — update Section 3 (Procedure Builder) and Section 4 (JsonRpcServer) with typed-context details

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (no regressions)

### Phase 8 — Middleware Pipeline 🗓 Planned

> **Goal:** Add composable middleware to `@jsontpc/core`. Middleware runs in a defined order:
> global server middleware → per-procedure middleware → input validation → handler → output
> validation. All changes are additive and backward-compatible.

#### `packages/core` — middleware

- [ ] `packages/core/src/middleware.ts` — define `MiddlewareContext<TContext>` interface and `MiddlewareFn<TContext>` type:
  - `MiddlewareContext<TContext>` carries `{ method: string; rawParams: unknown; context: TContext; result?: unknown; error?: JsonRpcError }`
  - `MiddlewareFn<TContext> = (ctx: MiddlewareContext<TContext>, next: () => Promise<void>) => Promise<void>`
- [ ] `packages/core/src/router.ts` — add `.use(...middleware: MiddlewareFn<TContext>[])` to `ProcedureBuilder`; add `middleware?: MiddlewareFn<TContext>[]` field to `ProcedureDef`
- [ ] `packages/core/src/server.ts` — add `server.use(...middleware: MiddlewareFn<TContext>[])` for global middleware; compose global + per-procedure middleware chain in `handle()` dispatch order
- [ ] `packages/core/src/index.ts` — export `MiddlewareFn`, `MiddlewareContext`
- [ ] `packages/core/tests/unit/middleware.test.ts` — new test file covering:
  - Global middleware runs before handler
  - Per-procedure middleware runs after global middleware
  - Middleware can mutate `ctx.context` (context enrichment)
  - Throwing `JsonRpcError` short-circuits to error response
  - Throwing plain `Error` produces `INTERNAL_ERROR` (same wrapping as handler errors)
  - Skipping `next()` suppresses the handler
  - Execution order: global 1 → global 2 → procedure 1 → procedure 2 → handler
- [ ] `packages/core/README.md` — add Middleware section with usage examples
- [ ] `docs/ARCHITECTURE.md` — add Section 12 (Middleware Pipeline)
- [ ] `examples/core/middleware.ts` — runnable example showing auth middleware pattern
- [ ] `examples/package.json` — add `core:middleware` script

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (no regressions)

### Phase 9 — Pub/Sub & Event Bus 🗓 Planned

> **Goal:** Enable server-to-client push notifications over persistent transports (TCP, WS)
> with an automatic polling fallback for HTTP. Topics and their payloads are **fully type-safe**
> via a `TTopics extends PubSubTopics` generic threaded through server, registry, polling adapter,
> and client. Add a typed internal event bus injectable via context. Prerequisite: Phase 3
> WebSocket transport must be complete before WS pub/sub.

#### `packages/core` — pub/sub interfaces and type utilities

- [ ] `packages/core/src/pubsub.ts` — define `IPubSubTransport extends IServerTransport` interface:
  - `readonly supportsPush: true` (type discriminant)
  - `sendToConnection(connectionId: string, message: string): Promise<void>`
  - `onConnection(handler: (connectionId: string) => void): void`
  - `onDisconnect(handler: (connectionId: string) => void): void`
- [ ] `packages/core/src/pubsub.ts` — export type alias `PubSubTopics = Record<string, unknown>` (named constraint for use in generic bounds)
- [ ] `packages/core/src/pubsub.ts` — export mapped discriminated union `TopicNotification<TTopics extends PubSubTopics>`:
  - `type TopicNotification<TTopics> = { [K in keyof TTopics & string]: { topic: K; params: TTopics[K] } }[keyof TTopics & string]`
  - Narrowing on `.topic` automatically narrows `.params` to the correct payload type
- [ ] `packages/core/src/pubsub.ts` — export utility `InferTopicPayload<TTopics extends PubSubTopics, K extends keyof TTopics & string> = TTopics[K]`
- [ ] `packages/core/src/pubsub.ts` — define `IEventBus<TEvents extends Record<string, unknown> = Record<string, unknown>>` interface:
  - `on<K extends keyof TEvents & string>(event: K, listener: (data: TEvents[K]) => void): () => void` (returns unsubscribe fn)
  - `off<K extends keyof TEvents & string>(event: K, listener: (data: TEvents[K]) => void): void`
  - `emit<K extends keyof TEvents & string>(event: K, data: TEvents[K]): void`
- [ ] `packages/core/src/index.ts` — export `IPubSubTransport`, `IEventBus`, `PubSubTopics`, `TopicNotification`, `InferTopicPayload`
- [ ] `packages/core/README.md` — document new interfaces and type utilities in a "Pub/Sub Interfaces" section
- [ ] `docs/ARCHITECTURE.md` — Section 13 updated (complete with typed-topics design) ✓

#### `packages/pubsub/` — new package `@jsontpc/pubsub`

- [ ] `packages/pubsub/package.json` — scaffold: `name: "@jsontpc/pubsub"`, `peerDeps: { "@jsontpc/core": "workspace:*" }`, exports map
- [ ] `packages/pubsub/tsconfig.json` — extend `../../tsconfig.base.json`
- [ ] `packages/pubsub/tsup.config.ts` — entry `src/index.ts`, formats `esm` + `cjs`
- [ ] `packages/pubsub/vitest.config.ts`
- [ ] `packages/pubsub/README.md` — stub with "Status: Not yet implemented"
- [ ] `packages/pubsub/src/registry.ts` — `SubscriptionRegistry<TTopics extends PubSubTopics = PubSubTopics>`:
  - `subscribe(connectionId: string, topic: keyof TTopics & string): void`
  - `unsubscribe(connectionId: string, topic: keyof TTopics & string): void`
  - `getSubscribers(topic: keyof TTopics & string): Set<string>`
  - `removeConnection(connectionId: string): void` (cleans all topics for that connection)
- [ ] `packages/pubsub/src/server.ts` — `PubSubServer<TTopics extends PubSubTopics = PubSubTopics>` **implements `IServerPlugin`**:
  - Constructor: `new PubSubServer<TTopics>(transport: IPubSubTransport | IServerTransport)` — no `server` or `TRouter` generic
  - `install(server: JsonRpcServer): void` — stores server reference; calls `server.registerProcedure()` for `rpc.subscribe`, `rpc.unsubscribe`; falls back to `PollingAdapter` (which registers `rpc.poll`) when transport lacks `supportsPush`
  - `publish<K extends keyof TTopics & string>(topic: K, data: TTopics[K]): Promise<void>` — fan-out via `sendToConnection` to all topic subscribers
  - `broadcast<K extends keyof TTopics & string>(topic: K, data: TTopics[K]): Promise<void>` — send to all active connections
  - No `listen()` method — user calls `transport.listen()` directly
- [ ] `packages/pubsub/src/polling.ts` — `PollingAdapter<TTopics extends PubSubTopics = PubSubTopics>`:
  - Per-session ring buffer of `TopicNotification<TTopics>` items keyed by `sessionId` (client-supplied UUID)
  - Registers `rpc.poll` procedure with params `{ sessionId: string }` that flushes and returns `{ notifications: Array<TopicNotification<TTopics>> }`
  - `rpc.subscribe` and `rpc.unsubscribe` params include `sessionId` for HTTP sessions
  - Configurable `maxBuffer` (default 100 items) and `ttlMs` (default 60 000 ms); sessions with no activity evicted after `ttlMs`
- [ ] `packages/pubsub/src/client.ts` — `createPubSubClient<TRouter, TTopics extends PubSubTopics = PubSubTopics>(transport: IClientTransport)`:
  - Wraps `createClient<TRouter>(transport)`
  - `.$subscribe<K extends keyof TTopics & string>(topic: K, callback: (data: TTopics[K]) => void): Promise<void>` — uses `transport.onMessage` for WS/TCP; starts polling loop for HTTP transports
  - `.$unsubscribe(topic: keyof TTopics & string): Promise<void>`
  - `.$unsubscribeAll(): Promise<void>`
- [ ] `packages/pubsub/src/event-bus.ts` — `EventBus<TEvents extends Record<string, unknown> = Record<string, unknown>>` class implementing `IEventBus<TEvents>` (Map of event → Set of listeners)
- [ ] `packages/pubsub/src/index.ts` — barrel export of all above
- [ ] `packages/pubsub/tests/integration/pubsub.test.ts` — integration tests:
  - Subscribe + publish round-trip over TCP (requires `TcpServerTransport` implementing `IPubSubTransport`)
  - Subscribe + publish round-trip over WS (requires `WsServerTransport` implementing `IPubSubTransport`)
  - HTTP polling fallback (subscribe → trigger → poll → receive)
  - `TopicNotification` discriminated union narrows correctly on `topic`
  - `removeConnection` cleans up subscriptions on disconnect
  - `EventBus` on/off/emit
- [ ] `packages/pubsub/README.md` — replace stub with real API docs
- [ ] `pnpm-workspace.yaml` — add `packages/pubsub`
- [ ] `turbo.json` — add `@jsontpc/pubsub` to the build pipeline
- [ ] Root `README.md` — update `@jsontpc/pubsub` row to `✅ Stable`, add install + Quick Start

#### Transport integration

- [ ] `packages/tcp/src/server.ts` — implement `IPubSubTransport` (expose connection tracking already implicit in per-socket handling)
- [ ] `packages/ws/src/server.ts` — implement `IPubSubTransport` (prerequisite: Phase 3 WS transport complete)

#### Examples

- [ ] `examples/pubsub/tcp-server.ts` — `PubSubServer` over TCP with typed `AppTopics`; publishes a counter every second
- [ ] `examples/pubsub/tcp-client.ts` — subscribes with typed callback, receives push notifications, exits after 5 events
- [ ] `examples/pubsub/http-polling-server.ts` — `PubSubServer` with HTTP polling fallback
- [ ] `examples/pubsub/http-polling-client.ts` — polls for notifications, narrows via `TopicNotification`, prints results, exits
- [ ] `examples/pubsub/event-bus.ts` — `EventBus<AppEvents>` used inside handlers via typed context
- [ ] `examples/package.json` — add `@jsontpc/pubsub workspace:*` dep and `pubsub:*` scripts
- [ ] `docs/TODO.md` section marked `COMPLETE ✅` when all items above are done
