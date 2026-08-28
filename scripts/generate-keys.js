#!/usr/bin/env node

/**
 * 生成服务端密钥并自动注入 .env
 *
 * 覆盖两类密钥：
 *   1. Ed25519 密钥对 (AUTH_PRIVATE_KEY / AUTH_PUBLIC_KEY)   — 授权响应签名
 *   2. RSA-2048 私钥 (RSA_PRIVATE_KEY)                       — 信封加密传输（公钥内嵌客户端）
 *
 * 默认仅生成 .env 中缺失的密钥（不覆盖现有部署密钥）；
 * 运行 `npm run generate-keys -- --force` 可全部重新生成。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT_DIR, '.env');
const ENV_EXAMPLE_FILE = path.join(ROOT_DIR, '.env.example');
const force = process.argv.includes('--force');

// 1. 生成 Ed25519 密钥对
const ed25519 = crypto.generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

// 提取 32 字节原始 Ed25519 公钥 Hex（C++ 客户端内嵌用）
const ed25519RawPubHex = crypto
  .createPublicKey(ed25519.publicKey)
  .export({ type: 'spki', format: 'der' })
  .subarray(-32)
  .toString('hex');

// 2. 生成 RSA-2048 密钥对
const rsa = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

// 提取 RSA 模数 n 与指数 e（C++ 客户端 BCRYPT_RSAKEY_BLOB 内嵌用）
const rsaJwk = crypto.createPublicKey(rsa.publicKey).export({ format: 'jwk' });
const b64urlToHex = (s) =>
  Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('hex');
const rsaModulusHex = b64urlToHex(rsaJwk.n);
const rsaExponentHex = b64urlToHex(rsaJwk.e);

// 3. 确保 .env 文件存在
if (!fs.existsSync(ENV_FILE)) {
  if (fs.existsSync(ENV_EXAMPLE_FILE)) {
    fs.copyFileSync(ENV_EXAMPLE_FILE, ENV_FILE);
    console.log('[配置] 未检测到 .env，已自动从 .env.example 复制创建。');
  } else {
    fs.writeFileSync(ENV_FILE, '', 'utf8');
  }
}

// 4. 按需写入缺失的密钥（默认不覆盖已有密钥）
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
    envContent += `\n${line}`;
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
if (!wroteAuth) console.log('✓ Ed25519: 保留 .env 中的现有密钥');
if (!wroteRsa) console.log('✓ RSA-2048: 保留 .env 中的现有密钥');

if (wroteAuth) {
  console.log('\n------------------------------------------------------');
  console.log('【Ed25519 客户端公钥】(test-client config.json 的 publicKey)');
  console.log('------------------------------------------------------');
  console.log('32 字节 Hex 格式 (C++ 客户端内嵌):');
  console.log(ed25519RawPubHex);
  console.log('\nPEM 格式 (Node/Python 客户端):');
  console.log(ed25519.publicKey);
}

if (wroteRsa) {
  console.log('------------------------------------------------------');
  console.log('【RSA-2048 客户端公钥】(test-client config.json 的 rsaPublicKey)');
  console.log('------------------------------------------------------');
  console.log('PEM 格式 (Node/Python 客户端):');
  console.log(rsa.publicKey);
  console.log('\n模数 n Hex (C++ 客户端内嵌, 256 字节大端):');
  console.log(rsaModulusHex);
  console.log('\n指数 e Hex:');
  console.log(rsaExponentHex);
}
console.log('======================================================\n');
