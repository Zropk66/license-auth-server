#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT_DIR, '.env');
const force = process.argv.includes('--force');

const ed25519 = crypto.generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const ed25519RawPubHex = crypto
  .createPublicKey(ed25519.publicKey)
  .export({ type: 'spki', format: 'der' })
  .subarray(-32)
  .toString('hex');

const rsa = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const rsaJwk = crypto.createPublicKey(rsa.publicKey).export({ format: 'jwk' });
const b64urlToHex = (s) =>
  Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('hex');
const rsaModulusHex = b64urlToHex(rsaJwk.n);
const rsaExponentHex = b64urlToHex(rsaJwk.e);

if (!fs.existsSync(ENV_FILE)) {
  fs.writeFileSync(ENV_FILE, '', 'utf8');
}

let envContent = fs.readFileSync(ENV_FILE, 'utf8');

function upsertEnv(key, value, newlyGenerated) {
  const line = `${key}="${value.replace(/\r?\n/g, '\\n')}"`;
  if (envContent.includes(`${key}=`) && !force) {
    console.log(`[跳过] ${key} 已存在（未加 --force，保留现有密钥）`);
    return false;
  }
  if (envContent.includes(`${key}=`)) {
    envContent = envContent.replace(new RegExp(`${key}=.*`), line);
  } else {
    envContent += (envContent.length > 0 && !envContent.endsWith('\n') ? '\n' : '') + `${line}`;
  }
  return newlyGenerated;
}

const wroteAuth = upsertEnv('AUTH_PRIVATE_KEY', ed25519.privateKey, true);
upsertEnv('AUTH_PUBLIC_KEY', ed25519.publicKey, true);
const wroteRsa = upsertEnv('RSA_PRIVATE_KEY', rsa.privateKey, true);

fs.writeFileSync(ENV_FILE, envContent.trim() + '\n', 'utf8');

console.log('\n======================================================');
console.log('            服务端密钥生成完成，已注入 .env');
console.log('======================================================\n');
if (!wroteAuth) console.log('Ed25519: 保留 .env 中的现有密钥');
if (!wroteRsa) console.log('RSA-2048: 保留 .env 中的现有密钥');

if (wroteAuth) {
  console.log('\n------------------------------------------------------');
  console.log('【Ed25519 客户端公钥】');
  console.log('------------------------------------------------------');
  console.log('32 字节 Hex 格式:');
  console.log(ed25519RawPubHex);
  console.log('\nPEM 格式:');
  console.log(ed25519.publicKey);
}

if (wroteRsa) {
  console.log('------------------------------------------------------');
  console.log('【RSA-2048 客户端公钥】');
  console.log('------------------------------------------------------');
  console.log('PEM 格式:');
  console.log(rsa.publicKey);
  console.log('\n模数 n Hex:');
  console.log(rsaModulusHex);
  console.log('\n指数 e Hex:');
  console.log(rsaExponentHex);
}
console.log('======================================================\n');
