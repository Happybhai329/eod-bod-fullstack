import test from 'node:test';
import assert from 'node:assert/strict';
import { getSyncStatus, runTwoWaySync } from '../server/syncEngine.js';

test('getSyncStatus returns current sync state and configuration indicator', async () => {
  const status = await getSyncStatus();
  assert.ok(status !== null, 'Status must not be null');
  assert.strictEqual(typeof status.isSyncing, 'boolean');
  assert.ok(['IDLE', 'SUCCESS', 'FAILED', 'NO_CREDENTIALS'].includes(status.lastSyncStatus));
});

test('runTwoWaySync handles synchronization execution gracefully', async () => {
  const res = await runTwoWaySync('TEST');
  assert.ok(res !== null, 'Response should not be null');
  assert.strictEqual(typeof res.success, 'boolean');
  if (res.success) {
    assert.ok(res.summary);
    assert.ok(res.summary.inbound);
    assert.ok(res.summary.outbound);
  }
});
