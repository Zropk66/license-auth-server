import test from 'node:test';
import assert from 'node:assert/strict';
import { isBogusHwid, checkLicenseRisk, recordLicenseFailure, recordLicenseSuccess } from '../lib/risk-control.ts';
import { ALLOWED_SETTING_KEYS, settingsUpdateSchema } from '../lib/validations.ts';
import { getHeartbeatIntervalInfo } from '../lib/heartbeat.ts';

test('isBogusHwid identifies fake or trivial sandbox HWIDs', () => {
  assert.equal(isBogusHwid(null).bogus, false);
  assert.equal(isBogusHwid('VALID-MACHINE-ID-12345').bogus, false);

  assert.equal(isBogusHwid('short').bogus, true);
  assert.equal(isBogusHwid('0000000000000000').bogus, true);
  assert.equal(isBogusHwid('FFFFFFFFFFFFFFFF').bogus, true);
  assert.equal(isBogusHwid('aaaaaaaaaaaaaaaa').bogus, true);
  assert.equal(isBogusHwid('00000000-0000-0000-0000-000000000000').bogus, true);
  assert.equal(isBogusHwid('my-sandbox-machine').bogus, true);
});

test('checkLicenseRisk and recordLicenseFailure tracks failure threshold', async () => {
  const cardKey = 'CARD-ATTACK-TEST';
  recordLicenseSuccess(cardKey);

  let risk = await checkLicenseRisk(cardKey);
  assert.equal(risk.blocked, false);

  for (let i = 0; i < 5; i += 1) {
    await recordLicenseFailure(cardKey, '1.2.3.4', 'test_failure');
  }

  risk = await checkLicenseRisk(cardKey);
  assert.equal(risk.blocked, true);
  assert.ok(risk.reason && risk.reason.includes('锁定'));

  recordLicenseSuccess(cardKey);
  risk = await checkLicenseRisk(cardKey);
  assert.equal(risk.blocked, false);
});

test('ALLOWED_SETTING_KEYS contains log cleanup and random heartbeat keys', () => {
  assert.ok(ALLOWED_SETTING_KEYS.includes('log_cleanup_mode'));
  assert.ok(ALLOWED_SETTING_KEYS.includes('log_cleanup_max_size_mb'));
  assert.ok(ALLOWED_SETTING_KEYS.includes('heartbeat_random_enabled'));
  assert.ok(ALLOWED_SETTING_KEYS.includes('heartbeat_interval_min'));
  assert.ok(ALLOWED_SETTING_KEYS.includes('heartbeat_interval_max'));

  const parsed = settingsUpdateSchema.safeParse({
    settings: [
      { key: 'log_cleanup_mode', value: 'size' },
      { key: 'log_cleanup_max_size_mb', value: '100' },
      { key: 'heartbeat_random_enabled', value: 'true' },
    ],
  });
  assert.ok(parsed.success);
});

test('getHeartbeatIntervalInfo returns valid positive interval and maxAllowedInterval', async () => {
  const info = await getHeartbeatIntervalInfo();
  assert.ok(info.interval >= 5);
  assert.ok(info.maxAllowedInterval >= info.interval || info.maxAllowedInterval >= 5);
});
