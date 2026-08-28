#!/usr/bin/env node

/**
 * 从服务端 .env 提取公钥生成 keys.h（C++ 客户端内嵌密钥）
 * 运行: node update-keys.js   （在 clients/cpp 目录下）
 * 服务端重新生成密钥（npm run generate-keys）后必须重新执行本脚本并重编译客户端
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const envFile = path.resolve(__dirname, '..', '..', '.env');
const env = fs.readFileSync(envFile, 'utf8');

const getEnv = (key) => {
  const m = env.match(new RegExp(`${key}="([\\s\\S]*?)"`));
  return m ? m[1].replace(/\\n/g, '\n') : null;
};

const authPubPem = getEnv('AUTH_PUBLIC_KEY');
const rsaPrivPem = getEnv('RSA_PRIVATE_KEY');
if (!authPubPem || !rsaPrivPem) {
  console.error('[错误] .env 中缺少 AUTH_PUBLIC_KEY 或 RSA_PRIVATE_KEY，请先在服务端运行 npm run generate-keys');
  process.exit(1);
}

// Ed25519 原始 32 字节公钥（SPKI DER 最后 32 字节）
const ed25519Hex = crypto
  .createPublicKey(authPubPem)
  .export({ type: 'spki', format: 'der' })
  .subarray(-32)
  .toString('hex');

// RSA 公钥模数与指数
const jwk = crypto.createPublicKey(rsaPrivPem).export({ format: 'jwk' });
const b64urlToHex = (s) =>
  Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('hex');
const modulusHex = b64urlToHex(jwk.n);
const exponentHex = b64urlToHex(jwk.e);

const header = `// 自动生成（node update-keys.js），请勿手工编辑
// 与服务端 .env 中 RSA_PRIVATE_KEY / AUTH_PRIVATE_KEY 配对
// 密钥轮换后重新运行脚本并重编译；公钥不是秘密，但必须与服务端私钥配对

#pragma once

// RSA-2048 公钥模数 n（${modulusHex.length / 2} 字节，大端）
static const char* RSA_MODULUS_HEX =
    "${modulusHex}";

// RSA 公钥指数 e（0x010001 = 65537）
static const char* RSA_EXPONENT_HEX = "${exponentHex}";

// Ed25519 验签公钥（32 字节）
static const char* ED25519_PUBLIC_KEY_HEX =
    "${ed25519Hex}";
`;

fs.writeFileSync(path.join(__dirname, 'keys.h'), header);
console.log('keys.h 已生成（RSA modulus + exponent, Ed25519 public key）');
