import test from 'node:test';
import assert from 'node:assert/strict';
import { executeHookScript } from '../lib/server/hook-runner.ts';

test('executeHookScript modifies payload successfully', async () => {
  const script = `
    payload.featureFlags = ['pro', 'beta'];
    payload.clientProtocol = req.protocol;
  `;
  const result = await executeHookScript({
    script,
    req: {
      protocol: 'verify',
      softwareName: 'PhotoTool',
      licenseKey: 'KEY-123',
    },
    payloadString: JSON.stringify({ initial: true }),
  });

  assert.equal(result.rejected, false);
  assert.equal(result.success, true);
  const parsed = JSON.parse(result.finalPayloadString);
  assert.equal(parsed.initial, true);
  assert.deepEqual(parsed.featureFlags, ['pro', 'beta']);
  assert.equal(parsed.clientProtocol, 'verify');
});

test('executeHookScript handles reject function invocation', async () => {
  const script = `
    if (req.protocol === 'veil') {
      reject('Veil protocol not allowed for this tier');
    }
  `;
  const result = await executeHookScript({
    script,
    req: {
      protocol: 'veil',
      softwareName: 'PhotoTool',
    },
    payloadString: null,
  });

  assert.equal(result.rejected, true);
  assert.equal(result.rejectReason, 'Veil protocol not allowed for this tier');
});

test('executeHookScript handles thrown error as rejection', async () => {
  const script = `
    throw new Error('Device blacklisted by hook');
  `;
  const result = await executeHookScript({
    script,
    req: {
      protocol: 'verify',
      softwareName: 'PhotoTool',
    },
    payloadString: null,
  });

  assert.equal(result.rejected, true);
  assert.equal(result.rejectReason, 'Device blacklisted by hook');
});

test('executeHookScript terminates infinite loops without crashing', async () => {
  const script = `
    while (true) {}
  `;
  const result = await executeHookScript({
    script,
    req: {
      protocol: 'verify',
      softwareName: 'PhotoTool',
    },
    payloadString: JSON.stringify({ safe: 1 }),
    timeoutMs: 30,
  });

  assert.equal(result.success, false);
  assert.equal(result.rejected, false);
  assert.equal(result.finalPayloadString, JSON.stringify({ safe: 1 }));
});

test('executeHookScript falls back gracefully on syntax error', async () => {
  const script = `
    const invalid = {;
  `;
  const result = await executeHookScript({
    script,
    req: {
      protocol: 'veil',
      softwareName: 'PhotoTool',
    },
    payloadString: 'raw-fallback',
  });

  assert.equal(result.success, false);
  assert.equal(result.rejected, false);
  assert.equal(result.finalPayloadString, 'raw-fallback');
});
