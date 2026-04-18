import { JsonRpcError } from "./errors.js";
import type { InferRouterInput, InferRouterOutput, Router } from "./router.js";
import type { JsonRpcRequest2, JsonRpcResponse2Err, JsonRpcResponse2Ok } from "./types.js";

// ---------------------------------------------------------------------------
// Transport interface (implemented by each @jsontpc/* transport package)
// ---------------------------------------------------------------------------

export interface IClientTransport {
  /** Send a serialized JSON-RPC message, resolve with the raw response string. */
  send(message: string): Promise<string>;
  /** For streaming transports (TCP/WS): subscribe to unsolicited server messages. */
  onMessage?: (handler: (msg: string) => void) => void;
  connect?(): Promise<void>;
  close?(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Proxy type
// ---------------------------------------------------------------------------

export type ClientProxy<TRouter extends Router> = {
  [K in keyof TRouter]: (
    params: InferRouterInput<TRouter>[K],
  ) => Promise<InferRouterOutput<TRouter>[K]>;
};

// ---------------------------------------------------------------------------
// createClient
// ---------------------------------------------------------------------------

export function createClient<TRouter extends Router>(
  transport: IClientTransport,
): ClientProxy<TRouter> {
  let idCounter = 0;

  return new Proxy({} as ClientProxy<TRouter>, {
    get(_target, prop: string | symbol) {
      if (typeof prop !== "string") return undefined;

      return async (params: unknown): Promise<unknown> => {
        const id = ++idCounter;

        const request: JsonRpcRequest2 = {
          jsonrpc: "2.0",
          method: prop,
          params: params as JsonRpcRequest2["params"],
          id,
        };

        const rawResponse = await transport.send(JSON.stringify(request));
        const response = JSON.parse(rawResponse) as JsonRpcResponse2Ok | JsonRpcResponse2Err;

        if ("error" in response && response.error != null) {
          throw new JsonRpcError(response.error.message, response.error.code, response.error.data);
        }

        return (response as JsonRpcResponse2Ok).result;
      };
    },
  });
}
