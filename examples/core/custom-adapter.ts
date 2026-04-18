/**
 * examples/core/custom-adapter.ts
 *
 * Demonstrates both adapter integration paths using the built-in node:http
 * module (no framework dependencies needed):
 *
 * PATH 1 — OOP interface:
 *   Implement `IFrameworkAdapter<IncomingMessage, ServerResponse>` and wire
 *   via `bindAdapter(server, new NodeHttpAdapter())`.
 *
 * PATH 2 — Function factory (shown in comments):
 *   Use `createRequestHandler(server)` and call it from a raw http listener.
 *
 * Run: pnpm --filter jsontpc-examples core:custom-adapter
 */

import * as http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  bindAdapter,
  createRequestHandler,
  createRouter,
  JsonRpcServer,
  procedure,
} from "@jsontpc/core";
import type { IFrameworkAdapter } from "@jsontpc/core";

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = createRouter({
  add: procedure.handler(({ input }) => {
    const { a, b } = input as { a: number; b: number };
    return a + b;
  }),
});

const server = new JsonRpcServer(router);

// ---------------------------------------------------------------------------
// PATH 1 — OOP adapter
// ---------------------------------------------------------------------------

class NodeHttpAdapter implements IFrameworkAdapter<IncomingMessage, ServerResponse> {
  /** Read the full request body as a UTF-8 string. */
  extractBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", reject);
    });
  }

  /** Write the JSON-RPC response (or 204 for notifications). */
  writeResponse(res: ServerResponse, body: string | null): void {
    if (body === null) {
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(body);
  }
}

// bindAdapter produces a (req, res, context?) => Promise<void> function
const rpcHandler = bindAdapter(server, new NodeHttpAdapter());

// ---------------------------------------------------------------------------
// PATH 2 — function factory (alternative, uncomment to use)
// ---------------------------------------------------------------------------
// const handle = createRequestHandler(server);
// const rpcHandler = async (req: IncomingMessage, res: ServerResponse) => {
//   const chunks: Buffer[] = [];
//   await new Promise<void>((resolve, reject) => {
//     req.on("data", (c: Buffer) => chunks.push(c));
//     req.on("end", resolve);
//     req.on("error", reject);
//   });
//   const rawBody = Buffer.concat(chunks).toString("utf8");
//   const responseBody = await handle(rawBody);
//   if (responseBody === null) { res.writeHead(204); res.end(); return; }
//   res.writeHead(200, { "Content-Type": "application/json" });
//   res.end(responseBody);
// };

// ---------------------------------------------------------------------------
// Start the HTTP server, run a self-test, then shut down
// ---------------------------------------------------------------------------

const httpServer = http.createServer((req, res) => {
  rpcHandler(req, res).catch((err: unknown) => {
    res.writeHead(500);
    res.end(String(err));
  });
});

await new Promise<void>((resolve) => httpServer.listen(3099, resolve));
console.log("Custom adapter server listening on http://localhost:3099");

// Self-test via fetch
const response = await fetch("http://localhost:3099", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", method: "add", params: { a: 20, b: 22 }, id: 1 }),
});
const data = (await response.json()) as { result: number };
console.log("add(20, 22) →", data.result); // 42

await new Promise<void>((resolve, reject) =>
  httpServer.close((err) => (err ? reject(err) : resolve())),
);
console.log("Server closed.");
