#!/usr/bin/env node

/**
 * 生成用于软件授权签名的 Ed25519 密钥对并自动注入 .env
 * 运行方式: npm run generate-keys
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT_DIR, '.env');
const ENV_EXAMPLE_FILE = path.join(ROOT_DIR, '.env.example');

// 1. 生成 Ed25519 密钥对
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

// 提取 32 字节原始公钥 Hex
const spkiDer = crypto.createPublicKey(publicKey).export({ type: 'spki', format: 'der' });
const rawPubBytes = spkiDer.subarray(spkiDer.length - 32);
const rawPubHex = rawPubBytes.toString('hex');

// 转义为单行 env 字符串
const envPrivateKey = privateKey.replace(/\r?\n/g, '\\n');
const envPublicKey = publicKey.replace(/\r?\n/g, '\\n');

// 2. 确保 .env 文件存在
if (!fs.existsSync(ENV_FILE)) {
  if (fs.existsSync(ENV_EXAMPLE_FILE)) {
    fs.copyFileSync(ENV_EXAMPLE_FILE, ENV_FILE);
    console.log('[配置] 未检测到 .env，已自动从 .env.example 复制创建。');
  } else {
    fs.writeFileSync(ENV_FILE, '', 'utf8');
  }
}

// 3. 自动将生成的密钥写入/更新至 .env
let envContent = fs.readFileSync(ENV_FILE, 'utf8');

const privateKeyLine = `AUTH_PRIVATE_KEY="${envPrivateKey}"`;
const publicKeyLine = `AUTH_PUBLIC_KEY="${envPublicKey}"`;

if (envContent.includes('AUTH_PRIVATE_KEY=')) {
  envContent = envContent.replace(/AUTH_PRIVATE_KEY=.*/g, privateKeyLine);
} else {
  envContent += `\n${privateKeyLine}`;
}

if (envContent.includes('AUTH_PUBLIC_KEY=')) {
  envContent = envContent.replace(/AUTH_PUBLIC_KEY=.*/g, publicKeyLine);
} else {
  envContent += `\n${publicKeyLine}`;
}

fs.writeFileSync(ENV_FILE, envContent.trim() + '\n', 'utf8');

console.log('\n======================================================');
console.log('       Ed25519 授权签名密钥对已生成并自动注入 .env');
console.log('======================================================\n');
console.log('✓ 服务端私钥与公钥已成功写入 .env');
console.log('\n------------------------------------------------------');
console.log('【客户端公钥】:');
console.log('------------------------------------------------------');
console.log('32 字节 Hex 格式:');
console.log(rawPubHex);
console.log('\nPEM 格式:');
console.log(publicKey);
console.log('======================================================\n');
