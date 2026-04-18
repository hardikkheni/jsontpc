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
jsontpc/
  src/
    core/              ← Zero-dependency protocol core
      types.ts         ← Wire types only (no logic)
      errors.ts        ← JsonRpcError class + ErrorCode enum
      protocol.ts      ← parse/serialize/detect helpers
      router.ts        ← procedure builder, createRouter, type helpers
      server.ts        ← JsonRpcServer (dispatch engine)
      client.ts        ← createClient<TRouter> proxy factory
    transports/
      http/
        server.ts      ← HttpServerTransport
        client.ts      ← HttpClientTransport
      tcp/
        server.ts      ← TcpServerTransport
        client.ts      ← TcpClientTransport
        framing.ts     ← IFramer interface + NdJsonFramer
      ws/
        server.ts      ← WsServerTransport
        client.ts      ← WsClientTransport
    adapters/
      express.ts       ← jsonRpcExpress() middleware factory
      fastify.ts       ← jsonRpcFastify() plugin factory
      nestjs/
        module.ts      ← JsonRpcModule.forRoot() dynamic module
        decorator.ts   ← @JsonRpcHandler() method decorator
        service.ts     ← JsonRpcService injectable
    index.ts           ← Barrel: core re-exports only
  tests/
    unit/              ← Pure unit tests (no network I/O)
    integration/       ← Real sockets/servers, torn down after each test
  docs/
    ARCHITECTURE.md    ← Detailed design doc
  AGENTS.md            ← This file
  README.md
  package.json
  tsconfig.json
  tsup.config.ts
  vitest.config.ts
```

---

## Commands

```bash
pnpm install         # install deps (use pnpm, not npm/yarn)
pnpm build           # tsup → dist/ (ESM + CJS, .d.ts files)
pnpm test            # vitest run (all tests)
pnpm test:watch      # vitest watch mode
pnpm typecheck       # tsc --noEmit
pnpm lint            # eslint src/ tests/
```

Always run `pnpm typecheck` and `pnpm test` after any change. Do not submit code that fails either.

---

## Implementation Phases

Work through phases **in order**. Do not start a later phase until the current one fully passes
`pnpm typecheck` and `pnpm test`.

### Phase 1 — Project Scaffold
- [ ] `package.json` — name `jsontpc`, `"type": "module"`, exports map, peerDependencies
- [ ] `tsconfig.json` — `strict: true`, `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`
- [ ] `tsup.config.ts` — dual ESM + CJS, all entry points, `dts: true`
- [ ] `vitest.config.ts`
- [ ] `pnpm install` succeeds, `pnpm build` exits 0 (empty entries are fine at this stage)

### Phase 2 — Core Protocol
- [ ] `src/core/types.ts`
- [ ] `src/core/errors.ts`
- [ ] `src/core/protocol.ts`
- [ ] `src/core/router.ts`
- [ ] `src/core/server.ts`
- [ ] `src/core/client.ts`
- [ ] `src/index.ts`
- [ ] Unit tests: `tests/unit/protocol.test.ts`, `tests/unit/server.test.ts`, `tests/unit/router.test.ts`
- [ ] All unit tests pass

### Phase 3 — Transports (implement in any order, one at a time)
- [ ] `src/transports/http/` + `tests/integration/http.test.ts`
- [ ] `src/transports/tcp/` + `tests/integration/tcp.test.ts`
- [ ] `src/transports/ws/` + `tests/integration/ws.test.ts`

### Phase 4 — Framework Adapters (implement in any order)
- [ ] `src/adapters/express.ts` + integration test
- [ ] `src/adapters/fastify.ts` + integration test
- [ ] `src/adapters/nestjs/` + integration test

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
- Imports within `src/` must use explicit `.js` extensions (NodeNext resolution):
  `import { JsonRpcError } from '../core/errors.js'`

### Core Layer Rules (enforced by convention, verify manually)
- `src/core/` **must not** import from `src/transports/` or `src/adapters/`
- `src/core/` **must not** import `zod` at the top level — only import it inside functions
  that are only called when a schema is present, OR use a dynamic `import()` with a fallback
- `src/transports/` **may** import from `src/core/` but not from `src/adapters/`
- `src/adapters/` **may** import from `src/core/` and `src/transports/`

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
- NestJS decorator: `@JsonRpcHandler`
- Keep exported names stable — this is a library; renaming is a breaking change

### Testing
- Unit tests mock nothing network-related — they test pure functions and class logic only
- Integration tests create real servers and close them in `afterEach`/`afterAll`
- Use `vitest`'s `expect.assertions(n)` in async error-path tests to ensure the assertion runs
- Test both 1.0 and 2.0 request/response shapes in `server.test.ts`
- Test notifications, batches, missing methods, invalid params, and internal errors

---

## What Is Out of Scope

Do **not** implement the following (post-v1 backlog):

- Browser bundle / UMD build
- Server-initiated push notifications to clients (currently only client → server notifications)
- Authentication or middleware hooks on the `JsonRpcServer` itself
- gRPC, AMQP, MQTT, or other non-TCP/HTTP/WS transports
- JSON-RPC over Server-Sent Events (SSE)
- Observability / tracing hooks (OpenTelemetry)
- A CLI tool (`jsontpc generate`, etc.)

If the user requests any of the above, note that it is out of scope and confirm before proceeding.

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
- [ ] No `any` types introduced
- [ ] New public API is documented in `README.md`
- [ ] If a new transport or adapter was added, it appears in the exports map in `package.json`
  and as an entry in `tsup.config.ts`
