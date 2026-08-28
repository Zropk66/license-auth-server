#pragma once

#include <cstdint>
#include <string>

namespace secure_http {

struct HttpResponse {
  bool ok = false;          // 网络层是否收到响应
  uint32_t statusCode = 0;
  std::string body;         // UTF-8 JSON
  std::string error;        // 网络层错误描述
};

// POST JSON 到 serverUrl + path（serverUrl 形如 https://license.zropk.icu）
// 支持 HTTPS_PROXY 环境变量（如 http://127.0.0.1:8080）走本地代理，用于抓包测试
HttpResponse HttpPostJson(const std::string& serverUrl, const std::string& path, const std::string& jsonBody);

}  // namespace secure_http
