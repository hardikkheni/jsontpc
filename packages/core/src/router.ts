// Procedure router: types, fluent builder, and helpers.
// This file has zero imports from other packages — all types are self-contained.

// ---------------------------------------------------------------------------
// Zod-compatible duck-type interface
// (Zod schemas satisfy this without importing 'zod' here)
// ---------------------------------------------------------------------------

export interface Schema<T> {
  parse(data: unknown): T;
}

// ---------------------------------------------------------------------------
// Handler context
// ---------------------------------------------------------------------------

export interface HandlerContext<TIn> {
  input: TIn;
  context: unknown;
}

// ---------------------------------------------------------------------------
// Procedure definition (plain object, not a class)
// ---------------------------------------------------------------------------

export interface ProcedureDef<TIn, TOut> {
  inputSchema?: Schema<TIn>;
  outputSchema?: Schema<TOut>;
  handler: (ctx: HandlerContext<TIn>) => TOut | Promise<TOut>;
}

// ---------------------------------------------------------------------------
// Immutable fluent builder
// ---------------------------------------------------------------------------

export class ProcedureBuilder<TIn, TOut> {
  private readonly _inputSchema: Schema<TIn> | undefined;
  private readonly _outputSchema: Schema<TOut> | undefined;

  constructor(inputSchema?: Schema<TIn>, outputSchema?: Schema<TOut>) {
    this._inputSchema = inputSchema;
    this._outputSchema = outputSchema;
  }

  input<NewIn>(schema: Schema<NewIn>): ProcedureBuilder<NewIn, TOut> {
    return new ProcedureBuilder<NewIn, TOut>(
      schema,
      this._outputSchema as Schema<TOut> | undefined,
    );
  }

  output<NewOut>(schema: Schema<NewOut>): ProcedureBuilder<TIn, NewOut> {
    return new ProcedureBuilder<TIn, NewOut>(this._inputSchema as Schema<TIn> | undefined, schema);
  }

  handler<R extends TOut = TOut>(
    fn: (ctx: HandlerContext<TIn>) => R | Promise<R>,
  ): ProcedureDef<TIn, R> {
    return {
      inputSchema: this._inputSchema,
      outputSchema: this._outputSchema as Schema<R> | undefined,
      handler: fn,
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton entry-point
// ---------------------------------------------------------------------------

export const procedure = new ProcedureBuilder<unknown, unknown>();

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: intentional — procedure defs erase generics at the router level
export type Router = Record<string, ProcedureDef<any, any>>;

export function createRouter<T extends Router>(handlers: T): T {
  return handlers;
}

// ---------------------------------------------------------------------------
// Type inference helpers
// ---------------------------------------------------------------------------

export type InferProcedureInput<T> = T extends ProcedureDef<infer I, unknown> ? I : never;

export type InferProcedureOutput<T> = T extends ProcedureDef<unknown, infer O> ? O : never;

export type InferRouterInput<R extends Router> = {
  [K in keyof R]: InferProcedureInput<R[K]>;
};

export type InferRouterOutput<R extends Router> = {
  [K in keyof R]: InferProcedureOutput<R[K]>;
};
