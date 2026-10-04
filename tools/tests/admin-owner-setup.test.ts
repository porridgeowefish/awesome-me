import { expect, it, vi } from 'vitest';
import { requireOwnerInitialized } from '../../src/features/admin/ownerSetup';

it('reports an incomplete local setup instead of silently refreshing', async () => {
  const readHealth = vi.fn().mockResolvedValue({ownerInitialized:false});
  await expect(requireOwnerInitialized(readHealth)).rejects.toThrow('尚未找到站主账号');
  readHealth.mockResolvedValue({ownerInitialized:true});
  await expect(requireOwnerInitialized(readHealth)).resolves.toBeUndefined();
  expect(readHealth).toHaveBeenCalledTimes(2);
});

it('preserves a service error so setup failures are visible', async () => {
  const readHealth = vi.fn().mockRejectedValue(new Error('服务暂时不可用'));
  await expect(requireOwnerInitialized(readHealth)).rejects.toThrow('服务暂时不可用');
});
