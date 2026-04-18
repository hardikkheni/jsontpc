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

### Phase 1 — Monorepo Scaffold ✅
- [x] Root `package.json`, `tsconfig.base.json`, `tsconfig.json`, `pnpm-workspace.yaml`, `turbo.json`
- [x] `biome.json`, `lefthook.yml`, `.npmrc`, `.gitignore`
- [x] `.changeset/config.json`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`
- [x] All 7 `packages/*/` scaffolds with `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `src/index.ts`
- [x] `pnpm install`, `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm lint` all exit 0

### Phase 2 — Core Protocol
- [ ] `packages/core/src/types.ts`
- [ ] `packages/core/src/errors.ts`
- [ ] `packages/core/src/protocol.ts`
- [ ] `packages/core/src/router.ts`
- [ ] `packages/core/src/server.ts`
- [ ] `packages/core/src/client.ts`
- [ ] `packages/core/src/adapter.ts` — `IFrameworkAdapter`, `createRequestHandler`, `bindAdapter`
- [ ] `packages/core/src/index.ts` (replace stub with real barrel)
- [ ] Unit tests: `packages/core/tests/unit/protocol.test.ts`, `server.test.ts`, `router.test.ts`, `adapter.test.ts`
- [ ] Examples scaffold: `examples/package.json`, `examples/tsconfig.json`, add `examples` to `pnpm-workspace.yaml`
- [ ] `examples/core/basic-router.ts`, `zod-validation.ts`, `notifications.ts`, `batch.ts`, `custom-adapter.ts`
- [ ] All unit tests pass

### Phase 3 — Transports (implement in any order, one at a time)
- [ ] `packages/http/src/` + `packages/http/tests/integration/http.test.ts` + `examples/http/`
- [ ] `packages/tcp/src/` + `packages/tcp/tests/integration/tcp.test.ts` + `examples/tcp/`
- [ ] `packages/ws/src/` + `packages/ws/tests/integration/ws.test.ts` + `examples/ws/`

### Phase 4 — Framework Adapters (implement in any order)
- [ ] `packages/express/src/index.ts` + `packages/express/tests/integration/express.test.ts` + `examples/express/`
- [ ] `packages/fastify/src/index.ts` + `packages/fastify/tests/integration/fastify.test.ts` + `examples/fastify/`
- [ ] `packages/nestjs/src/` + `packages/nestjs/tests/integration/nestjs.test.ts` + `examples/nestjs/`

### Phase 5 — Polish
- [ ] Verify `package.json` exports map is complete
- [ ] Verify all entry points are included in `tsup.config.ts`
- [ ] Ensure `README.md` examples match the actual exported API names

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
- [ ] New public API is documented in `README.md`
- [ ] If a new transport or adapter was added, its `packages/*/package.json` exports map is
  complete and it appears in the root `turbo.json` pipeline
