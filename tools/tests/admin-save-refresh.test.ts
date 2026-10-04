import { expect, it } from 'vitest';
import { refreshAfterSave } from '../../src/features/admin/saveRefresh';

it('does not turn a committed save into a failure when the public snapshot is unavailable', async () => {
  await expect(refreshAfterSave(async()=>{throw new Error('offline');})).resolves.toContain('内容已保存');
});
it('does not show a synchronization warning after a successful refresh', async () => {
  await expect(refreshAfterSave(async()=>({revision:12}))).resolves.toBeUndefined();
});
