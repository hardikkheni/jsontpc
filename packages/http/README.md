# @jsontpc/http

HTTP transport for `@jsontpc/core` — uses the native Node.js `http` module and the global `fetch` API.

> **Status: Not yet implemented.** See [docs/TODO.md](../../docs/TODO.md) for the implementation checklist.

---

## Planned API

### `HttpServerTransport`

Registers a `request` listener on a `node:http` server. Reads the POST body, dispatches via `@jsontpc/core`, and writes the JSON response with `Content-Type: application/json`.

```ts
import * as http from 'node:http';
import { JsonRpcServer } from '@jsontpc/core';
import { HttpServerTransport } from '@jsontpc/http';

const server = new JsonRpcServer(router);
const transport = new HttpServerTransport(http.createServer(), { path: '/rpc' });
transport.attach(server);
transport.listen(3000);
```

### `HttpClientTransport`

Uses the global `fetch` API (Node 18+). POSTs the serialized request and returns the response body.

```ts
import { createClient } from '@jsontpc/core';
import { HttpClientTransport } from '@jsontpc/http';

const client = createClient<typeof router>(
  new HttpClientTransport('http://localhost:3000/rpc')
);
```

HTTP transport is stateless and request-response only — no server push.

---

See [docs/ARCHITECTURE.md §5.3](../../docs/ARCHITECTURE.md) for the full design.
