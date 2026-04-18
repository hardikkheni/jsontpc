import { Transform } from "node:stream";

/**
 * Pluggable framing strategy for TCP byte-stream transport.
 *
 * A framer is responsible for:
 *  - `encode`  – wrapping an outgoing message string into a Buffer that can be
 *                written directly to a socket.
 *  - `createDecoder` – producing a Transform stream that accepts raw socket
 *                chunks as input and emits one `string` per complete message
 *                (readableObjectMode: true).
 */
export interface IFramer {
  encode(message: string): Buffer;
  createDecoder(): Transform;
}

/**
 * Newline-Delimited JSON (NDJSON) framer — the default.
 *
 * Encoding: `<message>\n` (UTF-8)
 * Decoding: splits the incoming byte stream on `\n`; emits each non-empty
 *           trimmed line as a string.
 */
export class NdJsonFramer implements IFramer {
  encode(message: string): Buffer {
    return Buffer.from(`${message}\n`, "utf8");
  }

  createDecoder(): Transform {
    let buffer = "";

    return new Transform({
      readableObjectMode: true,

      transform(chunk: Buffer | string, _encoding, callback) {
        buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");

        const lines = buffer.split("\n");
        // The last element is either empty (trailing newline consumed) or an
        // incomplete line — keep it in the buffer.
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.length > 0) {
            this.push(trimmed);
          }
        }

        callback();
      },

      flush(callback) {
        // Emit any remaining bytes that were never terminated with \n.
        const trimmed = buffer.trim();
        if (trimmed.length > 0) {
          this.push(trimmed);
        }
        buffer = "";
        callback();
      },
    });
  }
}
