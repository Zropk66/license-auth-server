import test from 'node:test';
import assert from 'node:assert/strict';
import { executeHookScript } from '../lib/server/hook-runner.ts';

test('verify protocol hook handles payload mutation and request reflection', async () => {
  const script = `
    payload.hookProcessed = true;
    payload.sourceProtocol = req.protocol;
    payload.verifiedHwid = req.hwid;
  `;

  const result = await executeHookScript({
    script,
    req: {
      protocol: 'verify',
      softwareName: 'TestApp',
      licenseKey: 'KEY-TEST-1',
      hwid: 'HWID-ABC-123',
      ipAddress: '127.0.0.1',
    },
    payloadString: JSON.stringify({ base: 'data' }),
  });

  assert.equal(result.success, true);
  assert.equal(result.rejected, false);
  const data = JSON.parse(result.finalPayloadString);
  assert.equal(data.base, 'data');
  assert.equal(data.hookProcessed, true);
  assert.equal(data.sourceProtocol, 'verify');
  assert.equal(data.verifiedHwid, 'HWID-ABC-123');
});

test('veil protocol hook inspects evidence and rejects suspicious state', async () => {
  const script = `
    if (req.evidenceLayout === '2' && req.evidence && req.evidence.length > 500) {
      reject('Abnormal evidence size detected');
    }
    payload.veilSecured = true;
  `;

  const rejectedResult = await executeHookScript({
    script,
    req: {
      protocol: 'veil',
      softwareName: 'TestApp',
      licenseKey: 'KEY-TEST-2',
      evidenceLayout: '2',
      evidence: 'x'.repeat(600),
    },
    payloadString: null,
  });

  assert.equal(rejectedResult.rejected, true);
  assert.equal(rejectedResult.rejectReason, 'Abnormal evidence size detected');

  const allowedResult = await executeHookScript({
    script,
    req: {
      protocol: 'veil',
      softwareName: 'TestApp',
      licenseKey: 'KEY-TEST-2',
      evidenceLayout: '1',
      evidence: 'normal',
    },
    payloadString: null,
  });

  assert.equal(allowedResult.success, true);
  assert.equal(allowedResult.rejected, false);
  const data = JSON.parse(allowedResult.finalPayloadString);
  assert.equal(data.veilSecured, true);
});
