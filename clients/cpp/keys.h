// 自动生成（node update-keys.js），请勿手工编辑
// 与服务端 .env 中 RSA_PRIVATE_KEY / AUTH_PRIVATE_KEY 配对
// 密钥轮换后重新运行脚本并重编译；公钥不是秘密，但必须与服务端私钥配对

#pragma once

// RSA-2048 公钥模数 n（256 字节，大端）
static const char* RSA_MODULUS_HEX = "";

// RSA 公钥指数 e（0x010001 = 65537）
static const char* RSA_EXPONENT_HEX = "010001";

// Ed25519 验签公钥（32 字节）
static const char* ED25519_PUBLIC_KEY_HEX = "";
