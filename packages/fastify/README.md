# @jsontpc/fastify

Fastify plugin adapter for `@jsontpc/core`.

> **Status: Not yet implemented.** See [docs/TODO.md](../../docs/TODO.md) for the implementation checklist.

### Peer dependency

```bash
pnpm add fastify
```

---

## Planned API

### `jsonRpcFastify(server, opts?)`

Returns a Fastify plugin. Registers a POST route at `opts.path ?? '/'`. Fastify parses JSON bodies by default.

```ts
import Fastify from 'fastify';
import { JsonRpcServer } from '@jsontpc/core';
import { jsonRpcFastify } from '@jsontpc/fastify';

const server = new JsonRpcServer(router);
const app = Fastify();
app.register(jsonRpcFastify(server), { prefix: '/rpc' });
await app.listen({ port: 3000 });
```

Implemented internally using `bindAdapter` from `@jsontpc/core`.

---

See [docs/ARCHITECTURE.md §7.2](../../docs/ARCHITECTURE.md) for the full design.
