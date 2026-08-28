#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace secure {

// 随机字节（BCryptGenRandom，系统优先 RNG）
bool RandomBytes(uint8_t* buf, size_t len);

// SHA-256 摘要
bool Sha256(const uint8_t* data, size_t len, uint8_t out[32]);

// RSA-OAEP(SHA-256) 公钥加密：modulus/exponent 为大端字节
// 返回密文（RSA-2048 → 256 字节），失败返回空 vector
std::vector<uint8_t> RsaOaepEncrypt(
    const uint8_t* modulus, size_t modulusLen,
    const uint8_t* exponent, size_t exponentLen,
    const uint8_t* plaintext, size_t plaintextLen);

// AES-256-GCM 加密（IV 固定 12 字节，认证标签 16 字节）
bool AesGcmEncrypt(
    const uint8_t key[32], const uint8_t iv[12],
    const uint8_t* pt, size_t ptLen,
    std::vector<uint8_t>& ct, uint8_t tag[16]);

// AES-256-GCM 解密：认证标签不匹配（数据被篡改）返回 false
bool AesGcmDecrypt(
    const uint8_t key[32], const uint8_t iv[12],
    const uint8_t* ct, size_t ctLen, const uint8_t tag[16],
    std::vector<uint8_t>& pt);

// 编码工具
std::string HexEncode(const uint8_t* data, size_t len);
bool HexDecode(const std::string& hex, std::vector<uint8_t>& out);
std::string Base64Encode(const uint8_t* data, size_t len);

}  // namespace secure
