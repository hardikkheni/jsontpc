# @jsontpc/express

Express middleware adapter for `@jsontpc/core`.

> **Status: Not yet implemented.** See [docs/TODO.md](../../docs/TODO.md) for the implementation checklist.

### Peer dependency

```bash
pnpm add express
pnpm add -D @types/express
```

---

## Planned API

### `jsonRpcExpress(server, opts?)`

Returns an Express `RequestHandler`. Mount `express.json()` before this middleware — the adapter reads `req.body` (already parsed JSON).

```ts
import express from 'express';
import { JsonRpcServer } from '@jsontpc/core';
import { jsonRpcExpress } from '@jsontpc/express';

const server = new JsonRpcServer(router);
const app = express();
app.use(express.json());
app.post('/rpc', jsonRpcExpress(server));
app.listen(3000);
```

Implemented internally using `bindAdapter` from `@jsontpc/core` — the dispatch loop is never reimplemented in this package.

---

See [docs/ARCHITECTURE.md §7.1](../../docs/ARCHITECTURE.md) for the full design.
