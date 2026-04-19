import type { IClientTransport } from '@jsontpc/core';

export interface HttpClientTransportOptions {
  /** Additional headers to include in every request */
  headers?: Record<string, string>;
}

export class HttpClientTransport implements IClientTransport {
  private readonly url: string;
  private readonly extraHeaders: Record<string, string>;

  constructor(url: string, options: HttpClientTransportOptions = {}) {
    this.url = url;
    this.extraHeaders = options.headers ?? {};
  }

  async send(message: string): Promise<string> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.extraHeaders,
      },
      body: message,
    });

    // 204 No Content — notification or all-notification batch
    if (response.status === 204) {
      return '';
    }

    return response.text();
  }
}
