#include "crypto.h"

#include <windows.h>
#include <bcrypt.h>

#include <cstdio>
#include <cstdlib>
#include <cstring>

#pragma comment(lib, "bcrypt.lib")

// TweetNaCl 要求使用方提供的随机源（tweetnacl.c 内以 extern 声明）
extern "C" void randombytes(unsigned char* buf, unsigned long long len) {
  if (!secure::RandomBytes(buf, static_cast<size_t>(len))) {
    // 随机源不可用属于致命错误：防重放 nonce / 会话密钥不能降级
    std::fprintf(stderr, "[致命错误] 系统随机源不可用，程序终止。\n");
    std::exit(1);
  }
}

namespace secure {

bool RandomBytes(uint8_t* buf, size_t len) {
  NTSTATUS st = BCryptGenRandom(nullptr, buf, static_cast<ULONG>(len), BCRYPT_USE_SYSTEM_PREFERRED_RNG);
  return BCRYPT_SUCCESS(st);
}

bool Sha256(const uint8_t* data, size_t len, uint8_t out[32]) {
  BCRYPT_ALG_HANDLE hAlg = nullptr;
  BCRYPT_HASH_HANDLE hHash = nullptr;
  bool ok = false;

  if (!BCRYPT_SUCCESS(BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_SHA256_ALGORITHM, nullptr, 0))) goto cleanup;
  if (!BCRYPT_SUCCESS(BCryptCreateHash(hAlg, &hHash, nullptr, 0, nullptr, 0, 0))) goto cleanup;
  if (!BCRYPT_SUCCESS(BCryptHashData(hHash, const_cast<PUCHAR>(data), static_cast<ULONG>(len), 0))) goto cleanup;
  ok = BCRYPT_SUCCESS(BCryptFinishHash(hHash, out, 32, 0));

cleanup:
  if (hHash) BCryptDestroyHash(hHash);
  if (hAlg) BCryptCloseAlgorithmProvider(hAlg, 0);
  return ok;
}

std::vector<uint8_t> RsaOaepEncrypt(
    const uint8_t* modulus, size_t modulusLen,
    const uint8_t* exponent, size_t exponentLen,
    const uint8_t* plaintext, size_t plaintextLen) {
  std::vector<uint8_t> result;

  // BCRYPT_RSAKEY_BLOB = 头 + PublicExponent[cbPublicExp] + Modulus[cbModulus]
  const size_t blobSize = sizeof(BCRYPT_RSAKEY_BLOB) + exponentLen + modulusLen;
  std::vector<uint8_t> blob(blobSize);
  auto* header = reinterpret_cast<BCRYPT_RSAKEY_BLOB*>(blob.data());
  header->Magic = BCRYPT_RSAPUBLIC_MAGIC;
  header->BitLength = static_cast<ULONG>(modulusLen * 8);
  header->cbPublicExp = static_cast<ULONG>(exponentLen);
  header->cbModulus = static_cast<ULONG>(modulusLen);
  header->cbPrime1 = 0;
  header->cbPrime2 = 0;
  uint8_t* p = blob.data() + sizeof(BCRYPT_RSAKEY_BLOB);
  memcpy(p, exponent, exponentLen);
  memcpy(p + exponentLen, modulus, modulusLen);

  BCRYPT_ALG_HANDLE hAlg = nullptr;
  BCRYPT_KEY_HANDLE hKey = nullptr;
  ULONG outLen = 0;

  if (!BCRYPT_SUCCESS(BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_RSA_ALGORITHM, nullptr, 0))) goto cleanup;
  if (!BCRYPT_SUCCESS(BCryptImportKeyPair(hAlg, nullptr, BCRYPT_RSAPUBLIC_BLOB, &hKey, blob.data(),
                                          static_cast<ULONG>(blobSize), 0))) {
    goto cleanup;
  }

  {
    BCRYPT_OAEP_PADDING_INFO oaep = {};
    oaep.pszAlgId = BCRYPT_SHA256_ALGORITHM;
    oaep.pbLabel = nullptr;
    oaep.cbLabel = 0;

    result.resize(modulusLen);  // RSA-2048 密文长度恒等于模数长度
    NTSTATUS st = BCryptEncrypt(hKey, const_cast<PUCHAR>(plaintext),
                                static_cast<ULONG>(plaintextLen), &oaep, nullptr, 0,
                                result.data(), static_cast<ULONG>(result.size()), &outLen,
                                BCRYPT_PAD_OAEP);
    if (!BCRYPT_SUCCESS(st)) {
      result.clear();
    } else {
      result.resize(outLen);
    }
  }

cleanup:
  if (hKey) BCryptDestroyKey(hKey);
  if (hAlg) BCryptCloseAlgorithmProvider(hAlg, 0);
  return result;
}

namespace {

bool openAesGcm(const uint8_t key[32], BCRYPT_ALG_HANDLE* hAlg, BCRYPT_KEY_HANDLE* hKey) {
  if (!BCRYPT_SUCCESS(BCryptOpenAlgorithmProvider(hAlg, BCRYPT_AES_ALGORITHM, nullptr, 0))) return false;
  if (!BCRYPT_SUCCESS(BCryptSetProperty(*hAlg, BCRYPT_CHAINING_MODE,
                                        reinterpret_cast<PUCHAR>(const_cast<wchar_t*>(BCRYPT_CHAIN_MODE_GCM)),
                                        sizeof(BCRYPT_CHAIN_MODE_GCM), 0))) {
    return false;
  }
  if (!BCRYPT_SUCCESS(BCryptGenerateSymmetricKey(*hAlg, hKey, nullptr, 0,
                                                 const_cast<PUCHAR>(key), 32, 0))) {
    return false;
  }
  return true;
}

BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO makeAuthInfo(const uint8_t iv[12], uint8_t* tag) {
  BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO info;
  BCRYPT_INIT_AUTH_MODE_INFO(info);
  info.pbNonce = const_cast<PUCHAR>(iv);
  info.cbNonce = 12;
  info.pbTag = tag;
  info.cbTag = 16;
  return info;
}

}  // namespace

bool AesGcmEncrypt(
    const uint8_t key[32], const uint8_t iv[12],
    const uint8_t* pt, size_t ptLen,
    std::vector<uint8_t>& ct, uint8_t tag[16]) {
  BCRYPT_ALG_HANDLE hAlg = nullptr;
  BCRYPT_KEY_HANDLE hKey = nullptr;
  bool ok = false;

  if (!openAesGcm(key, &hAlg, &hKey)) goto cleanup;

  {
    auto info = makeAuthInfo(iv, tag);
    ct.resize(ptLen);
    ULONG outLen = 0;
    NTSTATUS st = BCryptEncrypt(hKey, const_cast<PUCHAR>(pt), static_cast<ULONG>(ptLen), &info,
                                nullptr, 0, ct.data(), static_cast<ULONG>(ct.size()), &outLen, 0);
    if (BCRYPT_SUCCESS(st)) {
      ct.resize(outLen);
      ok = true;
    } else {
      ct.clear();
    }
  }

cleanup:
  if (hKey) BCryptDestroyKey(hKey);
  if (hAlg) BCryptCloseAlgorithmProvider(hAlg, 0);
  return ok;
}

bool AesGcmDecrypt(
    const uint8_t key[32], const uint8_t iv[12],
    const uint8_t* ct, size_t ctLen, const uint8_t tag[16],
    std::vector<uint8_t>& pt) {
  BCRYPT_ALG_HANDLE hAlg = nullptr;
  BCRYPT_KEY_HANDLE hKey = nullptr;
  bool ok = false;

  if (!openAesGcm(key, &hAlg, &hKey)) goto cleanup;

  {
    // pbTag 需要 BCryptDecrypt 校验：标签不匹配返回 STATUS_AUTH_TAG_MISMATCH
    auto info = makeAuthInfo(iv, const_cast<PUCHAR>(tag));
    pt.resize(ctLen);
    ULONG outLen = 0;
    NTSTATUS st = BCryptDecrypt(hKey, const_cast<PUCHAR>(ct), static_cast<ULONG>(ctLen), &info,
                                nullptr, 0, pt.data(), static_cast<ULONG>(pt.size()), &outLen, 0);
    if (BCRYPT_SUCCESS(st)) {
      pt.resize(outLen);
      ok = true;
    } else {
      pt.clear();
    }
  }

cleanup:
  if (hKey) BCryptDestroyKey(hKey);
  if (hAlg) BCryptCloseAlgorithmProvider(hAlg, 0);
  return ok;
}

std::string HexEncode(const uint8_t* data, size_t len) {
  static const char* kHex = "0123456789abcdef";
  std::string out;
  out.reserve(len * 2);
  for (size_t i = 0; i < len; ++i) {
    out.push_back(kHex[data[i] >> 4]);
    out.push_back(kHex[data[i] & 0xF]);
  }
  return out;
}

bool HexDecode(const std::string& hex, std::vector<uint8_t>& out) {
  if (hex.size() % 2 != 0) return false;
  out.clear();
  out.reserve(hex.size() / 2);
  for (size_t i = 0; i < hex.size(); i += 2) {
    int hi = -1, lo = -1;
    auto nibble = [](char c) -> int {
      if (c >= '0' && c <= '9') return c - '0';
      if (c >= 'a' && c <= 'f') return c - 'a' + 10;
      if (c >= 'A' && c <= 'F') return c - 'A' + 10;
      return -1;
    };
    hi = nibble(hex[i]);
    lo = nibble(hex[i + 1]);
    if (hi < 0 || lo < 0) return false;
    out.push_back(static_cast<uint8_t>((hi << 4) | lo));
  }
  return true;
}

std::string Base64Encode(const uint8_t* data, size_t len) {
  static const char* kTable =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string out;
  out.reserve((len + 2) / 3 * 4);

  size_t i = 0;
  for (; i + 3 <= len; i += 3) {
    uint32_t v = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    out.push_back(kTable[(v >> 18) & 0x3F]);
    out.push_back(kTable[(v >> 12) & 0x3F]);
    out.push_back(kTable[(v >> 6) & 0x3F]);
    out.push_back(kTable[v & 0x3F]);
  }
  if (i + 1 == len) {
    uint32_t v = data[i] << 16;
    out.push_back(kTable[(v >> 18) & 0x3F]);
    out.push_back(kTable[(v >> 12) & 0x3F]);
    out.push_back('=');
    out.push_back('=');
  } else if (i + 2 == len) {
    uint32_t v = (data[i] << 16) | (data[i + 1] << 8);
    out.push_back(kTable[(v >> 18) & 0x3F]);
    out.push_back(kTable[(v >> 12) & 0x3F]);
    out.push_back(kTable[(v >> 6) & 0x3F]);
    out.push_back('=');
  }
  return out;
}

}  // namespace secure
