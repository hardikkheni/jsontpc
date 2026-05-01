# AGENTS.md — Instructions for AI Coding Agents

This file guides AI agents (Codex, Copilot, Claude, etc.) working on this repository.
Read it fully before writing or modifying any code.

---

## Repository Overview

`jsontpc` is a transport-agnostic JSON-RPC 1.0 + 2.0 TypeScript library. Its design is documented in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Understand that document before touching any source file.

---

## Repo Layout

```
jsontpc-workspace/              ← monorepo root (private, not published)
  packages/
    core/                       ← @jsontpc/core
      src/
        types.ts                ← Wire types only (no logic)
        errors.ts               ← JsonRpcError class + ErrorCode enum
        protocol.ts             ← parse/serialize/detect helpers
        router.ts               ← procedure builder, createRouter, type helpers
        server.ts               ← JsonRpcServer (dispatch engine) + IServerTransport
        client.ts               ← createClient<TRouter> proxy factory + IClientTransport
        adapter.ts              ← IFrameworkAdapter, createRequestHandler, bindAdapter
        plugin.ts               ← IServerPlugin interface  (v0.2 new)
        plugins/
          introspection.ts      ← IntrospectionPlugin (rpc.describe)  (v0.2 new)
          health.ts             ← HealthPlugin (rpc.ping)  (v0.2 new)
        index.ts                ← Barrel re-export
      tests/unit/               ← Pure unit tests (no network I/O)
    http/                       ← @jsontpc/http
      src/
        server.ts               ← HttpServerTransport
        client.ts               ← HttpClientTransport
        index.ts
      tests/integration/
    tcp/                        ← @jsontpc/tcp
      src/
        server.ts               ← TcpServerTransport
        client.ts               ← TcpClientTransport
        framing.ts              ← IFramer interface + NdJsonFramer
        index.ts
      tests/integration/
    ws/                         ← @jsontpc/ws
      src/
        server.ts               ← WsServerTransport
        client.ts               ← WsClientTransport
        index.ts
      tests/integration/
    express/                    ← @jsontpc/express
      src/
        index.ts                ← jsonRpcExpress() middleware factory
      tests/integration/
    fastify/                    ← @jsontpc/fastify
      src/
        index.ts                ← jsonRpcFastify() plugin factory
      tests/integration/
    nestjs/                     ← @jsontpc/nestjs
      src/
        module.ts               ← JsonRpcModule.forRoot() dynamic module
        decorator.ts            ← @JsonRpcHandler() method decorator
        service.ts              ← JsonRpcService injectable
        index.ts
      tests/integration/
  examples/                     ← Runnable tsx scripts (one sub-folder per package)
    core/
      basic-router.ts
      zod-validation.ts
      notifications.ts
      batch.ts
      custom-adapter.ts
    http/                       ← added in Phase 3
    tcp/                        ← added in Phase 3
    ws/                         ← added in Phase 3
    express/                    ← added in Phase 4
    fastify/                    ← added in Phase 4
    nestjs/                     ← added in Phase 4
  docs/
    ARCHITECTURE.md             ← Detailed design doc
    TODO.md                     ← Implementation checklist
  AGENTS.md                     ← This file
  README.md
  package.json                  ← Private workspace root
  tsconfig.json                 ← Thin root (extends tsconfig.base.json)
  tsconfig.base.json            ← Shared compiler options for all packages
  pnpm-workspace.yaml           ← pnpm workspaces config
  turbo.json                    ← Turborepo task pipeline
  biome.json                    ← Lint + format (replaces ESLint + Prettier)
  lefthook.yml                  ← Pre-commit hooks (biome check on staged *.ts)
  .changeset/
    config.json                 ← Changeset versioning config
  .github/
    workflows/
      ci.yml                    ← CI: typecheck, lint, test, build (Node 18/20/22)
      release.yml               ← CD: changeset publish with npm provenance
  .npmrc
  .gitignore
```

---

## Commands

```bash
pnpm install         # install deps (use pnpm, not npm/yarn)
pnpm build           # turbo run build → dist/ in all packages (ESM + CJS, .d.ts)
pnpm test            # turbo run test  → vitest run in all packages
pnpm test:watch      # vitest watch mode (run inside a specific package)
pnpm typecheck       # turbo run typecheck → tsc --noEmit in all packages
pnpm lint            # biome check packages/
pnpm lint:fix        # biome check --write packages/
pnpm check:publint   # validate package.json exports map + dist layout (per package)
pnpm check:attw      # validate .d.ts exports for ESM + CJS consumers (per package)
```

Always run `pnpm typecheck` and `pnpm test` after any change. Do not submit code that fails either.

---

## Implementation Phases

Work through phases **in order**. Do not start a later phase until the current one fully passes
`pnpm typecheck` and `pnpm test`.

**Keeping phases current:** When you complete any item, mark it `[x]` immediately. When every item in a phase is `[x]`, append `✅` to the phase heading. Never leave a completed item marked `[ ]`.

### Phase 1 — Monorepo Scaffold ✅
- [x] Root `package.json`, `tsconfig.base.json`, `tsconfig.json`, `pnpm-workspace.yaml`, `turbo.json`
- [x] `biome.json`, `lefthook.yml`, `.npmrc`, `.gitignore`
- [x] `.changeset/config.json`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`
- [x] All 7 `packages/*/` scaffolds with `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `src/index.ts`
- [x] `pnpm install`, `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm lint` all exit 0

### Phase 2 — Core Protocol ✅
- [x] `packages/core/src/types.ts`
- [x] `packages/core/src/errors.ts`
- [x] `packages/core/src/protocol.ts`
- [x] `packages/core/src/router.ts`
- [x] `packages/core/src/server.ts`
- [x] `packages/core/src/client.ts`
- [x] `packages/core/src/adapter.ts` — `IFrameworkAdapter`, `createRequestHandler`, `bindAdapter`
- [x] `packages/core/src/index.ts` (replace stub with real barrel)
- [x] Unit tests: `packages/core/tests/unit/protocol.test.ts`, `server.test.ts`, `router.test.ts`, `adapter.test.ts`
- [x] Examples scaffold: `examples/package.json`, `examples/tsconfig.json`, add `examples` to `pnpm-workspace.yaml`
- [x] `examples/core/basic-router.ts`, `zod-validation.ts`, `notifications.ts`, `batch.ts`, `custom-adapter.ts`
- [x] All unit tests pass

### Phase 3 — Transports (implement in any order, one at a time)

#### HTTP — COMPLETE ✅
- [x] `packages/http/src/server.ts` — `HttpServerTransport`
- [x] `packages/http/src/client.ts` — `HttpClientTransport`
- [x] `packages/http/src/index.ts` (replace stub)
- [x] `packages/http/tests/integration/http.test.ts`
- [x] `examples/http/server.ts`, `examples/http/client.ts`
- [x] `packages/http/README.md` updated with real API docs
- [x] Root `README.md` updated (✅ Stable, install block, Quick Start, examples)
- [x] `examples/package.json` — dep + scripts added
- [x] `docs/TODO.md` section marked `COMPLETE ✅`

#### TCP — COMPLETE ✅
- [x] `packages/tcp/src/framing.ts` — `IFramer` interface + `NdJsonFramer`
- [x] `packages/tcp/src/server.ts` — `TcpServerTransport`
- [x] `packages/tcp/src/client.ts` — `TcpClientTransport`
- [x] `packages/tcp/src/index.ts` (replace stub)
- [x] `packages/tcp/tests/integration/tcp.test.ts`
- [x] `examples/tcp/server.ts`, `examples/tcp/client.ts`, `examples/tcp/custom-framing.ts`
- [x] `packages/tcp/README.md` updated with real API docs
- [x] Root `README.md` updated (✅ Stable, install block, Quick Start, examples)
- [x] `examples/package.json` — dep + scripts added
- [x] `docs/TODO.md` section marked `COMPLETE ✅`

#### WebSocket — pending
- [ ] `packages/ws/src/server.ts` — `WsServerTransport`
- [ ] `packages/ws/src/client.ts` — `WsClientTransport`
- [ ] `packages/ws/src/index.ts` (replace stub)
- [ ] `packages/ws/tests/integration/ws.test.ts`
- [ ] `examples/ws/server.ts`, `examples/ws/client.ts`
- [ ] `packages/ws/README.md` updated with real API docs
- [ ] Root `README.md` updated (✅ Stable, install block, Quick Start, examples)
- [ ] `examples/package.json` — dep + scripts added
- [ ] `docs/TODO.md` section marked `COMPLETE ✅`

### Phase 4 — Framework Adapters (implement in any order)

#### Express — COMPLETE ✅
- [x] `packages/express/src/index.ts` — `jsonRpcExpress()` middleware factory
- [x] `packages/express/tests/integration/express.test.ts`
- [x] `examples/express/server.ts`, `examples/express/client.ts`
- [x] `packages/express/README.md` updated with real API docs
- [x] Root `README.md` updated (✅ Stable, install block, Quick Start, examples)
- [x] `examples/package.json` — dep + scripts added
- [x] `docs/TODO.md` section marked `COMPLETE ✅`

#### Fastify — pending
- [ ] `packages/fastify/src/index.ts` — `jsonRpcFastify()` plugin factory
- [ ] `packages/fastify/tests/integration/fastify.test.ts`
- [ ] `examples/fastify/server.ts`, `examples/fastify/client.ts`
- [ ] `packages/fastify/README.md` updated with real API docs
- [ ] Root `README.md` updated (✅ Stable, install block, Quick Start, examples)
- [ ] `examples/package.json` — dep + scripts added
- [ ] `docs/TODO.md` section marked `COMPLETE ✅`

#### NestJS — pending
- [ ] `packages/nestjs/src/module.ts`, `decorator.ts`, `service.ts`, `index.ts`
- [ ] `packages/nestjs/tests/integration/nestjs.test.ts`
- [ ] `examples/nestjs/server.ts`, `examples/nestjs/client.ts`
- [ ] `packages/nestjs/README.md` updated with real API docs
- [ ] Root `README.md` updated (✅ Stable, install block, Quick Start, examples)
- [ ] `examples/package.json` — dep + scripts added
- [ ] `docs/TODO.md` section marked `COMPLETE ✅`

### Phase 5 — Polish
- [ ] Verify `package.json` exports map is complete for all packages
- [ ] Verify all entry points are included in `tsup.config.ts`
- [ ] Ensure `README.md` examples match the actual exported API names

---

> ## 🗓 v0.2 — Planned Features
>
> Do not begin Phase 6–9 work until Phases 1–5 are fully complete and v0.1.0 is published.
> All v0.2 additions must be backward-compatible (no breaking changes — new generics default to `unknown`).
>
> **Phase 6 — Plugin System:** `IServerPlugin` interface + `JsonRpcServer.register(plugin)` + `registerProcedure()` in `@jsontpc/core`. Built-in plugins: `IntrospectionPlugin` (`rpc.describe`), `HealthPlugin` (`rpc.ping`). `rpc.*` namespace reserved for first-party plugins.
>
> **Phase 7 — Typed Context:** Thread a `TContext` generic through `ProcedureBuilder`, `JsonRpcServer`, and adapter helpers. New export: `createProcedure<TContext>()`.
>
> **Phase 8 — Middleware Pipeline:** `MiddlewareFn<TContext>` / `MiddlewareContext<TContext>` in `@jsontpc/core`. Global middleware via `server.use()`, per-procedure via `procedure.use()`. New exports: `MiddlewareFn`, `MiddlewareContext`.
>
> **Phase 9 — Pub/Sub & Event Bus:** New interfaces `IPubSubTransport` / `IEventBus` in `@jsontpc/core`. New type utilities `PubSubTopics`, `TopicNotification<TTopics>`, `InferTopicPayload<TTopics, K>` exported from `@jsontpc/core` enable fully type-safe topic→payload mappings. New package `@jsontpc/pubsub` (`PubSubServer<TTopics>` **implements `IServerPlugin`**, `SubscriptionRegistry<TTopics>`, `PollingAdapter<TTopics>`, `createPubSubClient<TRouter, TTopics>`, `EventBus<TEvents>`). `PubSubServer` constructor is `new PubSubServer<TTopics>(transport)` — no `server` argument; `server.register(pubsub)` wires it in; no `listen()` method. `TTopics` defaults to `Record<string, unknown>` — untyped usage stays valid; typed usage enforces correct payloads on `publish`, `broadcast`, and `$subscribe` at compile time with no casts. TCP and WS transports implement `IPubSubTransport`; HTTP falls back to polling via `rpc.poll` with `sessionId` param which returns a typed `TopicNotification<TTopics>` discriminated union.
>
> Full implementation checklists: [`docs/TODO.md`](docs/TODO.md) Phases 6–9.
> Full design: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) sections 11–14.

---

## Coding Conventions

### TypeScript
- `strict: true` is non-negotiable — no `any`, no `// @ts-ignore`
- Use `unknown` instead of `any` for untyped data; narrow with type guards before use
- Prefer `interface` over `type` for object shapes that may be extended by users
- Export types that users need; do not export internal implementation details
- Use `const enum` for `ErrorCode` — values are inlined by the compiler, no runtime object

### Module System
- All source files use ESM (`import`/`export`) — no `require()`
- Imports within the same package must use explicit `.js` extensions (NodeNext resolution):
  `import { JsonRpcError } from './errors.js'`
- Cross-package imports use the npm package name (resolved via `workspace:*`):
  `import { JsonRpcError } from '@jsontpc/core'`

### Core Layer Rules (enforced by convention, verify manually)
- `packages/core/` **must not** import from any other `@jsontpc/*` package
- `packages/core/` **must not** import `zod` at the top level — only import it inside functions
  that are only called when a schema is present, OR use a dynamic `import()` with a fallback
- Transport packages (`@jsontpc/http`, `@jsontpc/tcp`, `@jsontpc/ws`) **may** import from
  `@jsontpc/core` but not from adapter packages
- Adapter packages (`@jsontpc/express`, `@jsontpc/fastify`, `@jsontpc/nestjs`) **may** import
  from `@jsontpc/core` and from transport packages

### Error Handling
- All thrown errors inside `JsonRpcServer.handle()` must be caught and converted to a
  `JsonRpcError` before being serialized. Never let a raw `Error` propagate to the transport layer.
- In `NODE_ENV !== 'production'`, include the original error message in `error.data.cause`
- In `NODE_ENV === 'production'`, `error.data` for `INTERNAL_ERROR` must be `undefined`
  (prevents leaking internal details — OWASP A05)
- Zod parse failures must produce `INVALID_PARAMS (-32602)` with `error.data` set to
  `zodError.issues` (field-level detail for the client)

### Naming
- Transport classes: `{Protocol}ServerTransport`, `{Protocol}ClientTransport`
- Adapter factories: `jsonRpc{Framework}` (camelCase, lowercase framework name)
- Generic adapter interface: `IFrameworkAdapter<TReq, TRes>`
- Function factory helper: `createRequestHandler(server)`
- Wiring helper: `bindAdapter(server, adapter)`
- NestJS decorator: `@JsonRpcHandler`
- Plugin classes: `{Feature}Plugin` for core built-ins (e.g. `IntrospectionPlugin`, `HealthPlugin`)
- `rpc.*` namespace is **reserved** for first-party plugins — user procedures must not start with `rpc.`
- Keep exported names stable — this is a library; renaming is a breaking change

### Testing
- Unit tests mock nothing network-related — they test pure functions and class logic only
- Integration tests create real servers and close them in `afterEach`/`afterAll`
- Use `vitest`'s `expect.assertions(n)` in async error-path tests to ensure the assertion runs
- Test both 1.0 and 2.0 request/response shapes in `server.test.ts`
- Test notifications, batches, missing methods, invalid params, and internal errors

### Adapter Integration Rule
- **Framework adapter packages MUST use `bindAdapter` or `createRequestHandler` from `@jsontpc/core`** — never reimplement the dispatch loop (parseMessage → handle/handleBatch → serializeResponse) inside an adapter package.
- `createRequestHandler` is the lowest-level integration point. Use it when you need a plain `(rawBody, context?) => Promise<string | null>` function.
- `bindAdapter` is for structured packages that implement `IFrameworkAdapter<TReq, TRes>`.
- Custom adapters for any framework are **in scope** — users can build and publish their own `@yourscope/jsontpc-{framework}` packages using these primitives.

---

### Examples

Runnable examples live in `examples/` at the monorepo root (not in `packages/`). They are executed with `tsx` and are **not** part of the Turborepo build pipeline.

- **Location**: `examples/{package-name}/{feature}.ts`
- **Runner**: `tsx` (no compile step needed)
- **Run from workspace root**: `pnpm --filter jsontpc-examples {package}:{feature}`
- **Rule**: Each example must be runnable in isolation — it starts any required server, performs its demo, and exits cleanly.
- **Deps**: The `examples/` package lists all `@jsontpc/*` deps as `workspace:*`. Any framework peer deps (e.g. `express`, `zod`) are devDependencies of `examples`.
- **Do not** include examples in `turbo.json` pipeline tasks or in `tsup` entry points.

---

## Documentation Hygiene

These rules apply whenever code in this repo changes. Follow them on every PR.

### After implementing a new transport or adapter

Complete **all** of the following before marking the work done:

1. **`docs/TODO.md`** — mark every checklist item for the feature as `[x]`. Change the section header to `COMPLETE ✅`.
2. **`packages/{name}/README.md`** — replace the "Status: Not yet implemented" stub with:
   - Real constructor signatures and option tables
   - Copy-pasteable usage code blocks (server + client side)
   - HTTP response codes or other transport-specific behaviour notes
3. **Root `README.md`**:
   - Change the package row status from `🚧 Planned` to `✅ Stable`
   - Add the package to the `pnpm add` install block
   - Add a Quick Start sub-section (`### {Transport}`) with Server + Client snippets
   - Add the transport's example commands to the Examples section
4. **`examples/{name}/`** — provide at least `server.ts` and `client.ts` (standalone, runnable, exit cleanly after demo).
5. **`examples/package.json`**:
   - Add the new `@jsontpc/{name}` package to `dependencies` as `workspace:*`
   - Add npm scripts: `"{name}:server"`, `"{name}:client"`, and any other example scripts
6. **Table of Contents** — if the root `README.md` uses a ToC, add the new Quick Start heading.

### General rules

- **After implementing any feature:** mark the corresponding items in `docs/TODO.md` as `[x]` and update the package's `README.md` to reflect the actual exported API.
- **`docs/ARCHITECTURE.md` is design-only.** It describes how the system works. Never add phase markers, TODO annotations, or implementation-status notes to it.
- **Root `README.md` shows only implemented, published features.** Unimplemented design details belong in `docs/ARCHITECTURE.md`. Pending tasks belong in `docs/TODO.md`. Unimplemented packages have their own stub `README.md` under `packages/*/README.md`.
- **Each package owns its own `README.md`** (`packages/*/README.md`). Keep it in sync with the package's actual exports. Stub READMEs for unimplemented packages must include a "Status: Not yet implemented" notice and a link to `docs/TODO.md`.
- **`CLAUDE.md` is a symlink to `AGENTS.md`.** Never edit `CLAUDE.md` directly — edit `AGENTS.md` instead.

---

Do **not** implement the following (post-v1 backlog):

- Browser bundle / UMD build
- Server-initiated push notifications to clients (currently only client → server notifications)
- Authentication or middleware hooks on the `JsonRpcServer` itself
- gRPC, AMQP, MQTT, or other non-TCP/HTTP/WS transports
- JSON-RPC over Server-Sent Events (SSE)
- Observability / tracing hooks (OpenTelemetry)
- A CLI tool (`jsontpc generate`, etc.)

**Custom framework adapters are explicitly IN SCOPE.** Any framework not covered by the first-party packages (Express, Fastify, NestJS) can be supported by implementing `IFrameworkAdapter` or calling `createRequestHandler` directly. Users and third parties may publish their own adapter packages using these primitives.

If the user requests gRPC, AMQP, SSE, or items from the backlog above, note that it is out of scope and confirm before proceeding.

---

## Security Reminders

- Never log full request bodies at INFO level — they may contain sensitive data
- Keep `NODE_ENV` production check in `server.ts` for error detail suppression
- Do not introduce `eval()`, `new Function()`, or dynamic `require()` anywhere
- Validate all external input (raw RPC messages) at the protocol parsing boundary — before
  it reaches handler code
- TCP and WS transports must guard against oversized messages (configurable `maxMessageSize`
  option — default 1 MB) to prevent memory exhaustion (OWASP A06: Vulnerable Components /
  DoS via resource exhaustion)

---

## Pull Request Checklist

Before marking a PR ready:

- [ ] `pnpm typecheck` passes (zero errors)
- [ ] `pnpm test` passes (all tests green)
- [ ] `pnpm build` passes (dist/ contains ESM + CJS + .d.ts for all entry points)
- [ ] `pnpm lint` passes (zero Biome errors)
- [ ] `pnpm check:publint` passes (no export map errors)
- [ ] `pnpm check:attw` passes (types resolve for both ESM and CJS consumers)
- [ ] No `any` types introduced
- [ ] New public API is documented in the package's `README.md`; root `README.md` shows only implemented features
- [ ] If a new transport or adapter was added:
  - [ ] `packages/*/README.md` has real API docs (no "Not yet implemented" stub)
  - [ ] Root `README.md` package table shows `✅ Stable`, install block and Quick Start section updated, examples section updated
  - [ ] `examples/{name}/server.ts` and `examples/{name}/client.ts` exist and are runnable
  - [ ] `examples/package.json` has the new dep + scripts
  - [ ] `docs/TODO.md` section marked `COMPLETE ✅`
  - [ ] `packages/*/package.json` exports map is complete and it appears in the root `turbo.json` pipeline
