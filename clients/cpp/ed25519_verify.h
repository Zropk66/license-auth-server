#pragma once

// Ed25519 验签封装（TweetNaCl 公有域实现）
// Windows CNG 不支持 Ed25519，故内嵌该实现；如需更高性能可替换为 libsodium / ed25519-donna

#include <cstring>
#include <vector>

extern "C" {
#include "tweetnacl.h"
}

// 验证 sig64 对 message 的 Ed25519 签名
inline bool Ed25519Verify(const uint8_t* msg, size_t msgLen, const uint8_t* sig64, const uint8_t* pub32) {
  std::vector<unsigned char> sm(64 + msgLen);
  std::vector<unsigned char> m(64 + msgLen);
  memcpy(sm.data(), sig64, 64);
  memcpy(sm.data() + 64, msg, msgLen);
  unsigned long long mlen = 0;
  if (crypto_sign_open(m.data(), &mlen, sm.data(), static_cast<unsigned long long>(sm.size()), pub32) != 0) {
    return false;
  }
  return mlen == msgLen && memcmp(m.data(), msg, msgLen) == 0;
}
