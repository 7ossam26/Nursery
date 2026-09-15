import { expect, it } from 'vitest';
import { AuthClient } from './client.js';

it('treats a successful empty licensing lifecycle response as success', async () => {
  const client = new AuthClient(async () => new Response(null, { status: 204 }));
  await expect(client.licensing<void>('accounts/11111111-1111-4111-8111-111111111111/block', 'POST', { reason: 'test' })).resolves.toBeUndefined();
});
