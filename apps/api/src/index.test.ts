import { describe, expect, it } from 'vitest';

import { buildApiApp } from './index.js';

describe('buildApiApp', () => {
  it('serves health with a server-generated request ID', async () => {
    const requestId = '9d658c18-88cc-4588-b6c7-e3ac335c581b';
    const app = buildApiApp({ generateRequestId: () => requestId });

    const response = await app.inject({
      headers: { 'x-request-id': 'client-controlled-value' },
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBe(requestId);
    expect(response.json()).toEqual({ status: 'ok' });

    await app.close();
  });
});
