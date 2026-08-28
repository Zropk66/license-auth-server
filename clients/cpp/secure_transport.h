#pragma once

// v2 信封加密传输（客户端侧）
//
//   请求  { "v": 2, "envelope": base64(RSA-OAEP-SHA256(公钥, 会话密钥)),
//           "payload": "iv:tag:ct" }          ← AES-256-GCM(会话密钥, 请求JSON)，hex
//   响应  { "v": 2, "payload": "iv:tag:ct" }  ← AES-256-GCM(同一会话密钥, 响应JSON)
//
// 会话密钥每请求随机生成 32 字节，仅存内存、不跨请求；
// 公钥内嵌于 keys.h，与 .env 私钥配对（密钥轮换后重跑 update-keys.js 并重编译）。

#include <string>

namespace secure {

struct WireResult {
  bool ok = false;
  std::string plaintext;  // 解密后的响应 JSON 原文
  std::string error;      // 失败描述（面向日志）
};

class SecureTransport {
 public:
  explicit SecureTransport(const std::string& serverUrl);

  // 发送加密请求并解密响应。requestJson 为明文请求对象的序列化结果。
  WireResult Post(const std::string& path, const std::string& requestJson);

  // 校验已解密响应：Ed25519 签名 + 时间戳新鲜度（±5 分钟）。
  // 成功时 dataOut 为 data 对象的原始字节（字节级精确，供字段提取）。
  // 失败不区分原因细节（签名坏 / 无签名 / 时间戳过期统一返回 false + error）。
  static bool VerifySigned(const std::string& responseJson,
                           std::string& dataOut, std::string& error);

 private:
  std::string serverUrl_;
};

}  // namespace secure
