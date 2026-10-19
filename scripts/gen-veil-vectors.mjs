import crypto from 'crypto';
import { writeFileSync } from 'node:fs';

// 与 lib/veil-envelope.ts 的逻辑逐行等价，去掉类型标注以便直接运行。
// 用途是生成跨实现夹具：C++ 侧用同一组输入派生，两侧结果必须逐字节
// 相同，否则对接时表现为「解不开」。

const NONCE_SIZE = 12;
const STAMP_SIZE = 8;
const TAG_SIZE = 16;

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

function buildInfo(cardKey, hwid, evidence, domain) {
  const hwidBytes = hwid ? Buffer.from(hwid, 'utf8') : Buffer.alloc(0);
  const ev = evidence ?? Buffer.alloc(0);
  return Buffer.concat([
    ev,
    Buffer.from([hwidBytes.length]),
    hwidBytes,
    Buffer.from([domain]),
  ]);
}

function deriveSessionKey(cardKey, nonce, hwid, evidence, domain) {
  return hkdfSha256(Buffer.from(cardKey, 'utf8'), nonce,
                    buildInfo(cardKey, hwid, evidence, domain), 32);
}

// 夹具用例。三组覆盖不同输入组合。
const cases = [];

{
  const nonce = Buffer.from('000102030405060708090a0b', 'hex');
  const evidence = Buffer.alloc(0);
  cases.push({
    name: 'empty hwid empty evidence',
    cardKey: 'VEIL-CARD-0001',
    hwid: '',
    nonceHex: nonce.toString('hex'),
    evidenceHex: evidence.toString('hex'),
    domain: 1,
    keyHex: deriveSessionKey('VEIL-CARD-0001', nonce, '', evidence, 1).toString('hex'),
  });
}

{
  const nonce = Buffer.from('101112131415161718191a1b', 'hex');
  const evidence = Buffer.alloc(64);
  for (let i = 0; i < evidence.length; i += 1) evidence[i] = i * 3 + 1;
  cases.push({
    name: 'hwid with evidence',
    cardKey: 'VEIL-CARD-0002',
    hwid: 'MACHINE-ABC-123',
    nonceHex: nonce.toString('hex'),
    evidenceHex: evidence.toString('hex'),
    domain: 1,
    keyHex: deriveSessionKey('VEIL-CARD-0002', nonce, 'MACHINE-ABC-123', evidence, 1).toString('hex'),
  });
}

{
  const nonce = Buffer.from('202122232425262728292a2b', 'hex');
  const evidence = Buffer.alloc(260);
  for (let i = 0; i < evidence.length; i += 1) evidence[i] = (i * 7) & 0xff;
  cases.push({
    name: 'domain separation',
    cardKey: 'VEIL-CARD-0003',
    hwid: 'MACHINE-XYZ-999',
    nonceHex: nonce.toString('hex'),
    evidenceHex: evidence.toString('hex'),
    domain: 2,
    keyHex: deriveSessionKey('VEIL-CARD-0003', nonce, 'MACHINE-XYZ-999', evidence, 2).toString('hex'),
  });
}

// 全长 HWID，覆盖长度前缀的边界
{
  const nonce = Buffer.from('303132333435363738393a3b', 'hex');
  const hwid = 'H'.repeat(127);
  cases.push({
    name: 'maximum hwid length',
    cardKey: 'VEIL-CARD-0004',
    hwid,
    nonceHex: nonce.toString('hex'),
    evidenceHex: '',
    domain: 1,
    keyHex: deriveSessionKey('VEIL-CARD-0004', nonce, hwid, Buffer.alloc(0), 1).toString('hex'),
  });
}

writeFileSync('D:/Zropk/Documents/CProjects/veil/tests/fixtures/veil_vectors.json', JSON.stringify({ cases }, null, 2));
console.log(`wrote ${cases.length} cross implementation cases`);
