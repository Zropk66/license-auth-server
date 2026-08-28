#include "secure_transport.h"

#include <chrono>
#include <cstdint>
#include <vector>

#include "crypto.h"
#include "ed25519_verify.h"
#include "http.h"
#include "json_mini.h"
#include "keys.h"

namespace secure {

namespace {

constexpr long long kTimestampToleranceMs = 300000;  // ±5 分钟

long long NowMs() {
  return std::chrono::duration_cast<std::chrono::milliseconds>(
             std::chrono::system_clock::now().time_since_epoch())
      .count();
}

}  // namespace

SecureTransport::SecureTransport(const std::string& serverUrl) : serverUrl_(serverUrl) {}

WireResult SecureTransport::Post(const std::string& path, const std::string& requestJson) {
  WireResult r;

  // 1. 每请求临时会话密钥（32 字节）+ 随机 IV
  uint8_t sessionKey[32];
  uint8_t iv[12];
  if (!RandomBytes(sessionKey, sizeof(sessionKey)) || !RandomBytes(iv, sizeof(iv))) {
    r.error = "系统随机源不可用";
    return r;
  }

  // 2. AES-256-GCM 加密请求载荷 → "iv:tag:ct"（hex）
  std::vector<uint8_t> ct;
  uint8_t tag[16];
  if (!AesGcmEncrypt(sessionKey, iv, reinterpret_cast<const uint8_t*>(requestJson.data()),
                     requestJson.size(), ct, tag)) {
    r.error = "请求加密失败";
    return r;
  }
  std::string payload = HexEncode(iv, sizeof(iv)) + ":" + HexEncode(tag, sizeof(tag)) + ":" +
                        HexEncode(ct.data(), ct.size());

  // 3. RSA-OAEP-SHA256 公钥包裹会话密钥 → base64 信封
  std::vector<uint8_t> modulus, exponent;
  if (!HexDecode(RSA_MODULUS_HEX, modulus) || modulus.size() != 256 ||
      !HexDecode(RSA_EXPONENT_HEX, exponent)) {
    r.error = "内置 RSA 公钥无效";
    return r;
  }
  std::vector<uint8_t> wrapped =
      RsaOaepEncrypt(modulus.data(), modulus.size(), exponent.data(), exponent.size(),
                     sessionKey, sizeof(sessionKey));
  if (wrapped.empty()) {
    r.error = "会话密钥加密失败";
    return r;
  }
  std::string envelope = Base64Encode(wrapped.data(), wrapped.size());

  // 4. 组包发送（payload 仅含 hex 与冒号，Escape 为恒等操作，保留以统一转义路径）
  std::string body = "{\"v\":2,\"envelope\":\"" + envelope + "\",\"payload\":\"" +
                     json_mini::Escape(payload) + "\"}";

  auto http = secure_http::HttpPostJson(serverUrl_, path, body);
  if (!http.ok) {
    r.error = http.error.empty() ? "网络请求失败" : http.error;
    return r;
  }
  if (http.statusCode != 200) {
    r.error = "HTTP 状态码异常: " + std::to_string(http.statusCode);
    return r;
  }

  // 5. 解析外层 { "v": 2, "payload": "iv:tag:ct" }
  double v = 0;
  std::string wirePayload;
  if (!json_mini::GetNumber(http.body, "v", v) || v != 2 ||
      !json_mini::GetString(http.body, "payload", wirePayload)) {
    r.error = "响应不符合 v2 协议格式";
    return r;
  }

  size_t p1 = wirePayload.find(':');
  size_t p2 = (p1 == std::string::npos) ? std::string::npos : wirePayload.find(':', p1 + 1);
  if (p1 == std::string::npos || p2 == std::string::npos ||
      wirePayload.find(':', p2 + 1) != std::string::npos) {
    r.error = "响应载荷格式无效";
    return r;
  }

  std::vector<uint8_t> iv2, tag2, ct2;
  if (!HexDecode(wirePayload.substr(0, p1), iv2) || iv2.size() != 12 ||
      !HexDecode(wirePayload.substr(p1 + 1, p2 - p1 - 1), tag2) || tag2.size() != 16 ||
      !HexDecode(wirePayload.substr(p2 + 1), ct2)) {
    r.error = "响应载荷解码失败";
    return r;
  }

  // 6. 会话密钥解密响应；GCM 认证标签同时校验完整性（篡改/密钥不匹配均失败）
  std::vector<uint8_t> pt;
  if (!AesGcmDecrypt(sessionKey, iv2.data(), ct2.data(), ct2.size(), tag2.data(), pt)) {
    r.error = "响应解密失败（服务端密钥已轮换或数据被篡改）";
    return r;
  }

  r.plaintext.assign(pt.begin(), pt.end());
  r.ok = true;
  return r;
}

bool SecureTransport::VerifySigned(const std::string& responseJson, std::string& dataOut,
                                   std::string& error) {
  std::string sigHex;
  if (!json_mini::GetRawObject(responseJson, "data", dataOut) ||
      !json_mini::GetString(responseJson, "signature", sigHex)) {
    error = "响应缺少签名数据";
    return false;
  }

  std::vector<uint8_t> sig;
  if (!HexDecode(sigHex, sig) || sig.size() != 64) {
    error = "签名格式无效";
    return false;
  }

  std::vector<uint8_t> pub;
  if (!HexDecode(ED25519_PUBLIC_KEY_HEX, pub) || pub.size() != 32) {
    error = "内置 Ed25519 公钥无效";
    return false;
  }

  if (!Ed25519Verify(reinterpret_cast<const uint8_t*>(dataOut.data()), dataOut.size(),
                     sig.data(), pub.data())) {
    error = "Ed25519 签名验证失败（伪造响应）";
    return false;
  }

  double ts = 0;
  if (!json_mini::GetNumber(dataOut, "timestamp", ts)) {
    error = "签名数据缺少时间戳";
    return false;
  }
  long long skew = NowMs() - static_cast<long long>(ts);
  if (skew > kTimestampToleranceMs || skew < -kTimestampToleranceMs) {
    error = "响应时间戳超出 ±5 分钟容差（疑似重放）";
    return false;
  }

  return true;
}

}  // namespace secure
