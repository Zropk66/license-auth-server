/**
 * License Auth Server — C++ 客户端（v2 信封加密传输）
 *
 * 安全栈：
 *   传输   RSA-OAEP-SHA256 信封包裹会话密钥 + AES-256-GCM 载荷加密（secure_transport）
 *   验证   Ed25519 响应签名 + 时间戳新鲜度校验（±5 分钟，防重放）
 *   防重放 每请求随机 nonce + 毫秒时间戳（服务端 validateNonce）
 *   机器码 WMI 真实硬件标识 + SHA-256，全部无效则终止（不使用随机降级）
 *   心跳   后台线程，fail-closed：连续 3 次协议失败 / 状态非 active / 服务端拒绝 → 停机
 *
 * 敏感信息（卡密 / HWID / 会话 ID）日志默认掩码显示。
 */

#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <string>
#include <thread>
#include <unordered_set>
#include <vector>
#include <windows.h>

#include "crypto.h"
#include "json_mini.h"
#include "secure_transport.h"

// 如果使用 VMProtect / Themida，可包含对应 SDK 头文件
// #include <VMProtectSDK.h>

namespace {

const std::unordered_set<std::string> HWID_INVALID = {
    "", "none", "null", "default string", "to be filled by o.e.m.",
    "00000000-0000-0000-0000-000000000000", "0", "system serial number",
};

// 敏感信息掩码：前 6 位 + **** + 后 4 位
std::string Mask(const std::string& s) {
  if (s.size() <= 10) return s.substr(0, 2) + "****";
  return s.substr(0, 6) + "****" + s.substr(s.size() - 4);
}

long long NowMs() {
  return std::chrono::duration_cast<std::chrono::milliseconds>(
             std::chrono::system_clock::now().time_since_epoch())
      .count();
}

}  // namespace

class LicenseClient {
 public:
  LicenseClient(const std::string& url, const std::string& key, const std::string& software)
      : transport_(url), licenseKey_(key), softwareName_(software) {
    hwid_ = BuildHwid();
    deviceName_ = GetDeviceName();
  }

  ~LicenseClient() { StopHeartbeat(); }

  // 授权验证：加密请求 → 解密响应 → Ed25519 验签 → 解析会话
  bool Verify() {
    // VMProtectBeginMutation("LicenseClient_Verify");

    std::string req =
        "{\"licenseKey\":\"" + json_mini::Escape(licenseKey_) + "\"," +
        "\"softwareName\":\"" + json_mini::Escape(softwareName_) + "\"," +
        "\"hwid\":\"" + json_mini::Escape(hwid_) + "\"," +
        "\"deviceName\":\"" + json_mini::Escape(deviceName_) + "\"," +
        "\"nonce\":\"" + MakeNonce() + "\"," +
        "\"timestamp\":" + std::to_string(NowMs()) + "}";

    std::cout << "[Verify] 发起授权验证" << std::endl;
    std::cout << "  - LicenseKey: " << Mask(licenseKey_) << std::endl;
    std::cout << "  - Software:   " << softwareName_ << std::endl;
    std::cout << "  - HWID:       " << Mask(hwid_) << std::endl;

    secure::WireResult r = transport_.Post("/api/license-verification/verify", req);
    if (!r.ok) {
      std::cout << "[Verify] 失败: " << r.error << std::endl;
      return false;
    }

    std::string data, err;
    if (!secure::SecureTransport::VerifySigned(r.plaintext, data, err)) {
      // GCM 解密成功但无有效签名 → 服务端明确拒绝，展示拒绝原因
      std::string errField, msgField;
      json_mini::GetString(r.plaintext, "error", errField);
      json_mini::GetString(r.plaintext, "message", msgField);
      std::cout << "[Verify] 被拒绝: " << (errField.empty() ? err : errField);
      if (!msgField.empty()) std::cout << " (" << msgField << ")";
      std::cout << std::endl;
      return false;
    }

    bool valid = false;
    json_mini::GetBool(data, "valid", valid);
    if (!valid) {
      std::cout << "[Verify] 授权无效" << std::endl;
      return false;
    }

    if (!json_mini::GetString(data, "sessionId", sessionId_)) {
      std::cout << "[Verify] 响应缺少 sessionId" << std::endl;
      return false;
    }
    double interval = 30;
    json_mini::GetNumber(data, "heartbeatInterval", interval);
    heartbeatInterval_ = static_cast<int>(interval);

    std::string expiration;
    json_mini::GetString(data, "expirationDate", expiration);

    std::cout << "[Verify] 通过（Ed25519 验签 + 时间戳校验 OK）" << std::endl;
    std::cout << "  - Session:    " << Mask(sessionId_) << std::endl;
    std::cout << "  - 到期时间:   " << (expiration.empty() ? "永久" : expiration) << std::endl;
    std::cout << "  - 心跳间隔:   " << heartbeatInterval_ << "s" << std::endl;

    StartHeartbeat();

    // VMProtectEnd();
    return true;
  }

  // 版本检查（同一加密通道，响应不带签名）
  void CheckUpdate(const std::string& currentVersion, const std::string& versionCode) {
    std::string req =
        "{\"software\":\"" + json_mini::Escape(softwareName_) + "\"," +
        "\"version\":\"" + json_mini::Escape(currentVersion) + "\"," +
        "\"versionCode\":\"" + json_mini::Escape(versionCode) + "\"}";

    secure::WireResult r = transport_.Post("/api/software/check-update", req);
    if (!r.ok) {
      std::cout << "[Update] 检查失败: " << r.error << std::endl;
      return;
    }

    bool hasUpdate = false;
    if (json_mini::GetBool(r.plaintext, "hasUpdate", hasUpdate) && hasUpdate) {
      std::string latest, url, forcedRaw;
      double forced = 0;
      std::string latestObj;
      if (json_mini::GetRawObject(r.plaintext, "latestVersion", latestObj)) {
        json_mini::GetString(latestObj, "version", latest);
        json_mini::GetString(latestObj, "downloadUrl", url);
        json_mini::GetNumber(latestObj, "isForced", forced);
      }
      std::cout << "[Update] 发现新版本 " << latest
                << (forced != 0 ? "（强制更新）" : "") << std::endl;
      if (!url.empty()) std::cout << "  - 下载: " << url << std::endl;
    } else {
      std::cout << "[Update] 已是最新版本" << std::endl;
    }
  }

  void StopHeartbeat() {
    running_ = false;
    if (heartbeatThread_.joinable()) heartbeatThread_.join();
  }

 private:
  /**
   * 采集真实硬件唯一标识，组合后 SHA-256 生成 HWID。
   *   主板 UUID | 主板序列号 | CPU ID | BIOS 序列号
   * 全部无效时直接终止，不使用任何随机降级。
   */
  std::string BuildHwid() {
    std::string cmd = "powershell -NoProfile -Command \""
        "$cs = Get-CimInstance Win32_ComputerSystemProduct; "
        "$bb = Get-CimInstance Win32_BaseBoard; "
        "$cpu = Get-CimInstance Win32_Processor; "
        "$bios = Get-CimInstance Win32_BIOS; "
        "Write-Output ($cs.UUID + '|' + $bb.SerialNumber + '|' + $cpu.ProcessorId + '|' + $bios.SerialNumber)"
        "\"";

    std::string raw = ExecCommand(cmd);

    std::vector<std::string> parts;
    size_t start = 0, end;
    while ((end = raw.find('|', start)) != std::string::npos) {
      std::string part = Trim(raw.substr(start, end - start));
      if (IsValidHwidValue(part)) parts.push_back(part);
      start = end + 1;
    }
    std::string last = Trim(raw.substr(start));
    if (IsValidHwidValue(last)) parts.push_back(last);

    if (parts.empty()) {
      std::cerr << "[致命错误] 无法获取任何有效硬件标识，程序终止。" << std::endl;
      std::exit(1);
    }

    std::string composite;
    for (size_t i = 0; i < parts.size(); i++) {
      if (i > 0) composite += "|";
      composite += parts[i];
    }

    uint8_t digest[32];
    if (!secure::Sha256(reinterpret_cast<const uint8_t*>(composite.data()), composite.size(),
                        digest)) {
      std::cerr << "[致命错误] SHA-256 计算失败，程序终止。" << std::endl;
      std::exit(1);
    }
    return "HW-" + secure::HexEncode(digest, 32);
  }

  std::string GetDeviceName() {
    char buf[MAX_COMPUTERNAME_LENGTH + 1] = {0};
    DWORD size = sizeof(buf);
    if (GetComputerNameA(buf, &size)) return std::string(buf);
    return "Unknown";
  }

  // 16 字节 CSPRNG → 32 hex 字符（防重放 nonce）
  std::string MakeNonce() {
    uint8_t buf[16];
    if (!secure::RandomBytes(buf, sizeof(buf))) {
      std::cerr << "[致命错误] 系统随机源不可用，程序终止。" << std::endl;
      std::exit(1);
    }
    return secure::HexEncode(buf, sizeof(buf));
  }

  static std::string ExecCommand(const std::string& cmd) {
    FILE* pipe = _popen(cmd.c_str(), "r");
    if (!pipe) return "";
    std::string result;
    char buffer[512];
    while (fgets(buffer, sizeof(buffer), pipe)) result += buffer;
    _pclose(pipe);
    return Trim(result);
  }

  static std::string Trim(const std::string& s) {
    size_t start = s.find_first_not_of(" \r\n\t");
    if (start == std::string::npos) return "";
    size_t end = s.find_last_not_of(" \r\n\t");
    return s.substr(start, end - start + 1);
  }

  static bool IsValidHwidValue(const std::string& val) {
    std::string lower = val;
    for (auto& c : lower) c = static_cast<char>(::tolower(static_cast<unsigned char>(c)));
    return !val.empty() && HWID_INVALID.find(lower) == HWID_INVALID.end();
  }

  // 心跳：fail-closed。GCM 解密即认证（只有持有会话密钥的服务端能产生有效响应），
  // 签名 + 状态校验后放行。
  void StartHeartbeat() {
    running_ = true;
    heartbeatThread_ = std::thread([this]() {
      int consecutiveFailures = 0;
      const int kMaxFailures = 3;

      while (running_) {
        std::this_thread::sleep_for(std::chrono::seconds(heartbeatInterval_));
        if (!running_) break;

        // VMProtectBeginVirtualization("LicenseClient_Heartbeat");

        std::string req =
            "{\"licenseKey\":\"" + json_mini::Escape(licenseKey_) + "\"," +
            "\"hwid\":\"" + json_mini::Escape(hwid_) + "\"," +
            "\"sessionId\":\"" + json_mini::Escape(sessionId_) + "\"," +
            "\"deviceName\":\"" + json_mini::Escape(deviceName_) + "\"," +
            "\"softwareName\":\"" + json_mini::Escape(softwareName_) + "\"," +
            "\"nonce\":\"" + MakeNonce() + "\"," +
            "\"timestamp\":" + std::to_string(NowMs()) + "}";

        secure::WireResult r = transport_.Post("/api/license-verification/heartbeat", req);

        if (!r.ok) {
          consecutiveFailures++;
          std::cout << "[Heartbeat] 传输失败 (" << consecutiveFailures << "/" << kMaxFailures
                    << "): " << r.error << std::endl;
          if (consecutiveFailures >= kMaxFailures) {
            std::cout << "[Heartbeat] 连续失败达上限，停止业务授权。" << std::endl;
            running_ = false;
            break;
          }
          continue;
        }
        consecutiveFailures = 0;

        std::string data, err;
        if (!secure::SecureTransport::VerifySigned(r.plaintext, data, err)) {
          std::string errField, msgField;
          json_mini::GetString(r.plaintext, "error", errField);
          json_mini::GetString(r.plaintext, "message", msgField);
          if (!errField.empty() || !msgField.empty()) {
            std::cout << "[Heartbeat] 被拒绝: " << errField;
            if (!msgField.empty()) std::cout << " (" << msgField << ")";
            std::cout << std::endl;
          } else {
            std::cout << "[Heartbeat] 响应校验失败: " << err << std::endl;
          }
          running_ = false;
          break;
        }

        std::string status;
        json_mini::GetString(data, "status", status);
        if (status != "active") {
          std::cout << "[Heartbeat] 会话状态异常: " << (status.empty() ? "(空)" : status)
                    << "，停止业务授权。" << std::endl;
          running_ = false;
          break;
        }

        std::cout << "[Heartbeat] OK (" << Mask(sessionId_) << ")" << std::endl;

        // VMProtectEnd();
      }
    });
  }

  secure::SecureTransport transport_;
  std::string licenseKey_;
  std::string softwareName_;
  std::string hwid_;
  std::string deviceName_;
  std::string sessionId_;
  int heartbeatInterval_ = 30;
  std::atomic<bool> running_{false};
  std::thread heartbeatThread_;
};

int main(int argc, char* argv[]) {
  // 用法: license-client.exe [serverUrl] [licenseKey] [softwareName]
  const std::string serverUrl = argc > 1 ? argv[1] : "https://license.zropk.icu";
  const std::string licenseKey = argc > 2 ? argv[2] : "23A01203-7D49D1C6-248B70CA-62E99DC0";
  const std::string softwareName = argc > 3 ? argv[3] : "test";

  std::cout << "==========================================" << std::endl;
  std::cout << " License Auth Server - C++ Client (v2)" << std::endl;
  std::cout << "==========================================" << std::endl;
  std::cout << " 服务器: " << serverUrl << std::endl;
  std::cout << " 协议:   RSA-OAEP 信封 + AES-256-GCM + Ed25519 验签" << std::endl;
  std::cout << std::endl;

  LicenseClient client(serverUrl, licenseKey, softwareName);

  if (!client.Verify()) {
    std::cerr << "\n授权验证失败，程序退出！" << std::endl;
    return 1;
  }

  client.CheckUpdate("1.0.0", "100");

  std::cout << "\n软件主功能已解锁，开始正常运行业务逻辑..." << std::endl;
  std::this_thread::sleep_for(std::chrono::seconds(65));
  client.StopHeartbeat();

  return 0;
}
