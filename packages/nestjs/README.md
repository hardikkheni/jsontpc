# @jsontpc/nestjs

NestJS dynamic module + decorator adapter for `@jsontpc/core`.

> **Status: Not yet implemented.** See [docs/TODO.md](../../docs/TODO.md) for the implementation checklist.

### Peer dependencies

```bash
pnpm add @nestjs/core @nestjs/common reflect-metadata
```

---

## Planned API

Three exports:

| Export | Purpose |
|--------|---------|
| `JsonRpcModule.forRoot(opts)` | Dynamic NestJS module — creates a `@Post(opts.path)` controller delegating to `JsonRpcService` |
| `@JsonRpcHandler('method', opts?)` | Method decorator — registers the method as a JSON-RPC handler |
| `JsonRpcService` | `@Injectable()` — holds a `JsonRpcServer` instance; scans decorated methods on `onModuleInit` |

```ts
// app.module.ts
import { JsonRpcModule } from '@jsontpc/nestjs';

@Module({ imports: [JsonRpcModule.forRoot({ path: '/rpc' })] })
export class AppModule {}

// math.service.ts
import { Injectable } from '@nestjs/common';
import { JsonRpcHandler } from '@jsontpc/nestjs';
import { z } from 'zod';

@Injectable()
export class MathService {
  @JsonRpcHandler('add', {
    input: z.object({ a: z.number(), b: z.number() }),
    output: z.number(),
  })
  add({ a, b }: { a: number; b: number }) {
    return a + b;
  }
}
```

---

See [docs/ARCHITECTURE.md §7.3](../../docs/ARCHITECTURE.md) for the full design.
