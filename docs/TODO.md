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

#### HTTP (`packages/http`)
- [ ] `packages/http/src/server.ts` — `HttpServerTransport` (uses `bindAdapter` internally)
- [ ] `packages/http/src/client.ts` — `HttpClientTransport`
- [ ] `packages/http/src/index.ts` (replace stub)
- [ ] `packages/http/tests/integration/http.test.ts`
- [ ] `examples/http/server.ts` — start an HTTP server
- [ ] `examples/http/client.ts` — call the server via `HttpClientTransport`

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
