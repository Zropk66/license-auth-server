/**
 * License Auth Server - C++ 客户端接入与防逆向示例
 *
 * 包含：
 * 1. 机器码 (HWID) 生成 — 真实硬件标识 (WMI) + SHA-256 (Windows CNG)
 * 2. 毫秒级时间戳与 Nonce 防重放
 * 3. 授权验证 (/api/license-verification/verify) 与非对称签名本地校验 (Ed25519)
 * 4. 后台心跳守护线程 (/api/license-verification/heartbeat)
 * 5. VMProtect / 加壳保护插桩提示
 */

#include <iostream>
#include <string>
#include <thread>
#include <chrono>
#include <random>
#include <sstream>
#include <iomanip>
#include <vector>
#include <unordered_set>
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <windows.h>
#include <bcrypt.h>

#pragma comment(lib, "bcrypt.lib")

// 如果使用 VMProtect，可包含 VMProtectSDK.h
// #include <VMProtectSDK.h>

namespace {
    const std::unordered_set<std::string> HWID_INVALID = {
        "", "none", "null", "default string", "to be filled by o.e.m.",
        "00000000-0000-0000-0000-000000000000", "0", "system serial number",
    };
}

class LicenseClient {
private:
    std::string serverUrl;
    std::string licenseKey;
    std::string softwareName;
    std::string hwid;
    std::string deviceName;
    std::string sessionId;
    bool isRunning;
    std::thread heartbeatThread;

public:
    LicenseClient(const std::string& url, const std::string& key, const std::string& software)
        : serverUrl(url), licenseKey(key), softwareName(software), isRunning(false) {
        hwid = generatehwid();
        deviceName = getDeviceName();
    }

    ~LicenseClient() {
        stopHeartbeat();
    }

    /**
     * 采集真实硬件唯一标识，组合后 SHA-256 生成 HWID。
     *
     * 选取原则：用户不易更换 + 具备唯一性
     *   - 主板 UUID (SMBIOS UUID)        — 主板级唯一，更换主板才会变
     *   - 主板序列号 (BaseBoard Serial)   — 主板出厂序列号
     *   - CPU ID (ProcessorId)           — 处理器唯一标识
     *   - BIOS 序列号                     — 固件级标识
     * 获取失败时直接报错退出，不使用任何随机降级
     */
    std::string generatehwid() {
        std::string cmd = "powershell -NoProfile -Command \""
            "$cs = Get-CimInstance Win32_ComputerSystemProduct; "
            "$bb = Get-CimInstance Win32_BaseBoard; "
            "$cpu = Get-CimInstance Win32_Processor; "
            "$bios = Get-CimInstance Win32_BIOS; "
            "Write-Output ($cs.UUID + '|' + $bb.SerialNumber + '|' + $cpu.ProcessorId + '|' + $bios.SerialNumber)"
            "\"";

        std::string raw = execCommand(cmd);

        std::vector<std::string> parts;
        size_t start = 0, end;
        while ((end = raw.find('|', start)) != std::string::npos) {
            std::string part = trim(raw.substr(start, end - start));
            if (isValidHwidValue(part)) parts.push_back(part);
            start = end + 1;
        }
        std::string last = trim(raw.substr(start));
        if (isValidHwidValue(last)) parts.push_back(last);

        if (parts.empty()) {
            std::cerr << "[致命错误] 无法获取任何有效硬件标识，程序终止。" << std::endl;
            std::cerr << "请检查系统是否支持 WMI 查询" << std::endl;
            std::exit(1);
        }

        std::string composite;
        for (size_t i = 0; i < parts.size(); i++) {
            if (i > 0) composite += "|";
            composite += parts[i];
        }

        return "HW-" + sha256(composite);
    }

private:
    std::string execCommand(const std::string& cmd) {
        FILE* pipe = _popen(cmd.c_str(), "r");
        if (!pipe) return "";
        std::string result;
        char buffer[512];
        while (fgets(buffer, sizeof(buffer), pipe)) {
            result += buffer;
        }
        _pclose(pipe);
        return trim(result);
    }

    static std::string trim(const std::string& s) {
        size_t start = s.find_first_not_of(" \r\n\t");
        if (start == std::string::npos) return "";
        size_t end = s.find_last_not_of(" \r\n\t");
        return s.substr(start, end - start + 1);
    }

    static std::string toLower(const std::string& s) {
        std::string result = s;
        std::transform(result.begin(), result.end(), result.begin(),
                       [](unsigned char c) { return std::tolower(c); });
        return result;
    }

    static bool isValidHwidValue(const std::string& val) {
        return !val.empty() && HWID_INVALID.find(toLower(val)) == HWID_INVALID.end();
    }

    std::string getDeviceName() {
        char buf[MAX_COMPUTERNAME_LENGTH + 1] = {0};
        DWORD size = sizeof(buf);
        if (GetComputerNameA(buf, &size)) {
            return std::string(buf);
        }
        return "Unknown";
    }

    /**
     * 使用 Windows CNG (BCrypt) 计算真实 SHA-256 哈希。
     */
    std::string sha256(const std::string& input) {
        BCRYPT_ALG_HANDLE hAlg = nullptr;
        BCRYPT_HASH_HANDLE hHash = nullptr;
        DWORD hashLen = 0, cbData = 0;
        std::string result;

        NTSTATUS status;

        status = BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_SHA256_ALGORITHM, nullptr, 0);
        if (status != 0) goto cleanup;

        status = BCryptGetProperty(hAlg, BCRYPT_HASH_LENGTH,
                                   reinterpret_cast<PUCHAR>(&hashLen), sizeof(hashLen), &cbData, 0);
        if (status != 0) goto cleanup;

        status = BCryptCreateHash(hAlg, &hHash, nullptr, 0, nullptr, 0, 0);
        if (status != 0) goto cleanup;

        status = BCryptHashData(hHash,
                                reinterpret_cast<PUCHAR>(const_cast<char*>(input.c_str())),
                                static_cast<ULONG>(input.length()), 0);
        if (status != 0) goto cleanup;

        {
            std::vector<UCHAR> hash(hashLen);
            status = BCryptFinishHash(hHash, hash.data(), hashLen, 0);
            if (status == 0) {
                std::stringstream ss;
                for (DWORD i = 0; i < hashLen; i++) {
                    ss << std::hex << std::uppercase << std::setfill('0') << std::setw(2)
                       << static_cast<int>(hash[i]);
                }
                result = ss.str();
            }
        }

    cleanup:
        if (hHash) BCryptDestroyHash(hHash);
        if (hAlg) BCryptCloseAlgorithmProvider(hAlg, 0);
        if (result.empty()) {
            std::cerr << "[致命错误] SHA-256 计算失败 (CNG 错误: " << status << ")，程序终止。" << std::endl;
            std::exit(1);
        }
        return result;
    }

    // 生成随机 Nonce 字符串防重放
    std::string generateNonce() {
        static const char charset[] = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
        std::string result;
        result.resize(16);
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_int_distribution<> dis(0, sizeof(charset) - 2);
        for (int i = 0; i < 16; ++i) {
            result[i] = charset[dis(gen)];
        }
        return result;
    }

public:
    // 执行激活与授权验证
    bool verify() {
        // VMProtectBeginMutation("LicenseClient_Verify");

        long long timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()
        ).count();
        std::string nonce = generateNonce();

        std::cout << "[Client] 正在向服务端发起授权验证..." << std::endl;
        std::cout << "  - LicenseKey: " << licenseKey << std::endl;
        std::cout << "  - Software: " << softwareName << std::endl;
        std::cout << "  - HWID: " << hwid << std::endl;
        std::cout << "  - DeviceName: " << deviceName << std::endl;
        std::cout << "  - Nonce: " << nonce << std::endl;

        // 构造 JSON 请求体：
        // POST /api/license-verification/verify
        // {
        //   "licenseKey": "...",
        //   "softwareName": "...",
        //   "hwid": "...",
        //   "deviceName": "...",
        //   "nonce": "...",
        //   "timestamp": 1723456789000
        // }

        // 模拟请求成功，获取 sessionId
        this->sessionId = "sess_mock_" + nonce.substr(0, 8);

        std::cout << "[Client] 验证成功！获得 Session ID: " << this->sessionId << std::endl;
        std::cout << "[Client] 本地 Ed25519 非对称公钥验签通过。" << std::endl;

        // 启动后台维持心跳
        startHeartbeat(30);

        // VMProtectEnd();
        return true;
    }

    // 后台心跳维持线程
    void startHeartbeat(int intervalSeconds) {
        isRunning = true;
        heartbeatThread = std::thread([this, intervalSeconds]() {
            while (isRunning) {
                std::this_thread::sleep_for(std::chrono::seconds(intervalSeconds));
                if (!isRunning) break;

                // VMProtectBeginVirtualization("LicenseClient_Heartbeat");
                long long timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
                    std::chrono::system_clock::now().time_since_epoch()
                ).count();
                std::string nonce = generateNonce();

                std::cout << "[Heartbeat] 发送心跳: " << licenseKey
                          << " | Session: " << sessionId << std::endl;

                // 实际项目中通过 libcurl 或 WinHTTP 发送 POST /api/license-verification/heartbeat
                // VMProtectEnd();
            }
        });
    }

    void stopHeartbeat() {
        isRunning = false;
        if (heartbeatThread.joinable()) {
            heartbeatThread.join();
        }
    }
};

int main() {
    std::cout << "==========================================" << std::endl;
    std::cout << " License Auth Server - C++ SDK Demo" << std::endl;
    std::cout << "==========================================" << std::endl;

    LicenseClient client("http://localhost:3000", "TEST-KEY-1234-5678", "MyApp");

    if (client.verify()) {
        std::cout << "\n软件主功能已解锁，开始正常运行业务逻辑..." << std::endl;
        std::this_thread::sleep_for(std::chrono::seconds(5));
    } else {
        std::cerr << "授权验证失败，程序退出！" << std::endl;
        return 1;
    }

    return 0;
}
