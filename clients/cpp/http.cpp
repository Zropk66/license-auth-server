#include "http.h"

#include <windows.h>
#include <winhttp.h>

#include <cstdlib>

#pragma comment(lib, "winhttp.lib")

namespace secure_http {

namespace {

std::wstring ToWide(const std::string& s) {
  if (s.empty()) return std::wstring();
  int len = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), static_cast<int>(s.size()), nullptr, 0);
  std::wstring out(len, 0);
  MultiByteToWideChar(CP_UTF8, 0, s.c_str(), static_cast<int>(s.size()), &out[0], len);
  return out;
}

// 解析 https://host[:port]/ 前缀，返回是否成功
bool ParseServerUrl(const std::string& url, bool* secure, std::string* host, uint16_t* port) {
  std::string rest;
  if (url.rfind("https://", 0) == 0) {
    *secure = true;
    rest = url.substr(8);
  } else if (url.rfind("http://", 0) == 0) {
    *secure = false;
    rest = url.substr(7);
  } else {
    return false;
  }

  // 去掉路径部分
  size_t slash = rest.find('/');
  if (slash != std::string::npos) rest = rest.substr(0, slash);

  uint16_t defaultPort = *secure ? 443 : 80;
  size_t colon = rest.rfind(':');
  if (colon != std::string::npos) {
    *port = static_cast<uint16_t>(atoi(rest.substr(colon + 1).c_str()));
    *host = rest.substr(0, colon);
  } else {
    *port = defaultPort;
    *host = rest;
  }
  return !host->empty();
}

// 读取 HTTPS_PROXY / https_proxy（形如 http://127.0.0.1:8080），返回代理 host:port 宽字符
std::wstring GetProxyFromEnv() {
  const char* proxy = std::getenv("HTTPS_PROXY");
  if (!proxy || !*proxy) proxy = std::getenv("https_proxy");
  if (!proxy || !*proxy) return std::wstring();

  std::string p = proxy;
  if (p.rfind("http://", 0) == 0) p = p.substr(7);
  if (p.rfind("https://", 0) == 0) p = p.substr(8);
  while (!p.empty() && (p.back() == '/' || p.back() == '\\')) p.pop_back();
  if (p.empty()) return std::wstring();
  return ToWide(p);
}

}  // namespace

HttpResponse HttpPostJson(const std::string& serverUrl, const std::string& path, const std::string& jsonBody) {
  HttpResponse res;

  bool secure = false;
  std::string host;
  uint16_t port = 0;
  if (!ParseServerUrl(serverUrl, &secure, &host, &port)) {
    res.error = "无效的服务端地址: " + serverUrl;
    return res;
  }

  const std::wstring wHost = ToWide(host);
  const std::wstring wPath = ToWide(path);

  HINTERNET hSession = nullptr;
  HINTERNET hConnect = nullptr;
  HINTERNET hRequest = nullptr;

  hSession = WinHttpOpen(L"LicenseClient/2.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                         WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
  if (!hSession) {
    res.error = "WinHttpOpen 失败";
    return res;
  }

  WinHttpSetTimeouts(hSession, 10000, 10000, 15000, 15000);

  hConnect = WinHttpConnect(hSession, wHost.c_str(), port, 0);
  if (!hConnect) {
    res.error = "无法连接服务端: " + host;
    WinHttpCloseHandle(hSession);
    return res;
  }

  hRequest = WinHttpOpenRequest(hConnect, L"POST", wPath.c_str(), nullptr, WINHTTP_NO_REFERER,
                                WINHTTP_DEFAULT_ACCEPT_TYPES, secure ? WINHTTP_FLAG_SECURE : 0);
  if (!hRequest) {
    res.error = "WinHttpOpenRequest 失败";
    WinHttpCloseHandle(hConnect);
    WinHttpCloseHandle(hSession);
    return res;
  }

  // 本地代理（抓包测试用）
  std::wstring proxy = GetProxyFromEnv();
  if (!proxy.empty()) {
    WINHTTP_PROXY_INFO pi = {};
    pi.dwAccessType = WINHTTP_ACCESS_TYPE_NAMED_PROXY;
    pi.lpszProxy = const_cast<LPWSTR>(proxy.c_str());
    pi.lpszProxyBypass = nullptr;
    WinHttpSetOption(hRequest, WINHTTP_OPTION_PROXY, &pi, sizeof(pi));
  }

  const std::wstring headers = L"Content-Type: application/json\r\n";
  BOOL sent = WinHttpSendRequest(
      hRequest, headers.c_str(), static_cast<DWORD>(-1),
      const_cast<LPSTR>(jsonBody.c_str()), static_cast<DWORD>(jsonBody.size()),
      static_cast<DWORD>(jsonBody.size()), 0);
  if (!sent || !WinHttpReceiveResponse(hRequest, nullptr)) {
    res.error = "请求发送失败（网络不可达或被拦截）";
    goto cleanup;
  }

  {
    DWORD status = 0;
    DWORD size = sizeof(status);
    WinHttpQueryHeaders(hRequest, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, nullptr, &status, &size, nullptr);
    res.statusCode = status;

    DWORD available = 0;
    while (WinHttpQueryDataAvailable(hRequest, &available) && available > 0) {
      std::string chunk(available, 0);
      DWORD read = 0;
      if (!WinHttpReadData(hRequest, &chunk[0], available, &read)) break;
      chunk.resize(read);
      res.body += chunk;
      if (read == 0) break;
    }
    res.ok = true;
  }

cleanup:
  if (hRequest) WinHttpCloseHandle(hRequest);
  if (hConnect) WinHttpCloseHandle(hConnect);
  if (hSession) WinHttpCloseHandle(hSession);
  return res;
}

}  // namespace secure_http
