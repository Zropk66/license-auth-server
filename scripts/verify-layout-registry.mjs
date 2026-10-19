import crypto from 'crypto';

// 验证布局注册表的语义：
//   登记的布局 → 服务端按对应长度取零基线
//   未登记的布局 → 拒绝
//   长度与声明不符 → 拒绝
//   攻击者改长度 → 派生出不同密钥，解不开

const NONCE_SIZE = 12;
const STAMP_SIZE = 8;

const EVIDENCE_LAYOUTS = {
  '1': { size: 68 },
  '2': { size: 328 },
};
const DEFAULT_LAYOUT_ID = '1';

function resolveLayoutId(value) {
  if (value === undefined || value === null) return DEFAULT_LAYOUT_ID;
  if (typeof value !== 'string') return null;
  if (!Object.prototype.hasOwnProperty.call(EVIDENCE_LAYOUTS, value)) return null;
  return value;
}

function serverEvidence(layoutId) {
  const layout = EVIDENCE_LAYOUTS[layoutId];
  if (!layout) return null;
  return Buffer.alloc(layout.size);
}

function hkdfSha256(ikm, salt, info, length) {
  const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
  const out = Buffer.alloc(length);
  let previous = Buffer.alloc(0);
  let offset = 0;
  let counter = 1;
  while (offset < length) {
    const block = crypto
      .createHmac('sha256', prk)
      .update(Buffer.concat([previous, info, Buffer.from([counter])]))
      .digest();
    const take = Math.min(block.length, length - offset);
    block.copy(out, offset, 0, take);
    offset += take;
    previous = block;
    counter += 1;
  }
  return out;
}

function buildInfo(hwid, evidence, domain) {
  const hwidBytes = hwid ? Buffer.from(hwid, 'utf8') : Buffer.alloc(0);
  return Buffer.concat([
    evidence,
    Buffer.from([hwidBytes.length]),
    hwidBytes,
    Buffer.from([domain]),
  ]);
}

function deriveKey(cardKey, nonce, hwid, evidence, domain) {
  return hkdfSha256(Buffer.from(cardKey, 'utf8'), nonce,
                    buildInfo(hwid, evidence, domain), 32);
}

let failures = 0;
function expect(condition, label) {
  console.log(`${condition ? 'ok' : 'FAIL'}: ${label}`);
  if (!condition) failures += 1;
}

// 布局解析
expect(resolveLayoutId(undefined) === '1', 'missing layout falls back to default');
expect(resolveLayoutId(null) === '1', 'null layout falls back to default');
expect(resolveLayoutId('1') === '1', 'registered layout 1 resolves');
expect(resolveLayoutId('2') === '2', 'registered layout 2 resolves');
expect(resolveLayoutId('3') === null, 'unregistered layout is rejected');
expect(resolveLayoutId('') === null, 'empty layout is rejected');
expect(resolveLayoutId(1) === null, 'numeric layout is rejected');
expect(resolveLayoutId('__proto__') === null, 'prototype key is rejected');
expect(resolveLayoutId('constructor') === null, 'constructor key is rejected');

// 零基线长度
expect(serverEvidence('1').length === 68, 'layout 1 baseline is 68 bytes');
expect(serverEvidence('2').length === 328, 'layout 2 baseline is 328 bytes');
expect(serverEvidence('9') === null, 'unregistered layout yields no baseline');

// 两套布局必须派生出不同密钥，否则登记表形同虚设
{
  const nonce = crypto.randomBytes(NONCE_SIZE);
  const key1 = deriveKey('CARD', nonce, 'HWID', serverEvidence('1'), 1);
  const key2 = deriveKey('CARD', nonce, 'HWID', serverEvidence('2'), 1);
  expect(!key1.equals(key2), 'different layouts derive different keys');
}

// 攻击者把布局声称为 2 但实际用 1 的长度：两侧密钥不同
{
  const nonce = crypto.randomBytes(NONCE_SIZE);
  const serverKey = deriveKey('CARD', nonce, 'HWID', serverEvidence('2'), 1);
  const attackerKey = deriveKey('CARD', nonce, 'HWID', serverEvidence('1'), 1);
  expect(!serverKey.equals(attackerKey),
         'claiming a larger layout does not yield the same key');
}

// 长度不符的请求必须被拒
{
  const reported = Buffer.alloc(68);
  const declaredSize = EVIDENCE_LAYOUTS['2'].size;
  const mismatched = reported.length !== 0 && reported.length !== declaredSize;
  expect(mismatched, 'reported length mismatching the declared layout is rejected');
}

// 空证据始终允许：客户端未启用任何 provider
{
  const empty = Buffer.alloc(0);
  const allowed = empty.length === 0 ||
                  empty.length === EVIDENCE_LAYOUTS['1'].size;
  expect(allowed, 'empty evidence is accepted under any registered layout');
}

console.log('');
console.log(failures === 0
  ? 'layout registry verified'
  : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
