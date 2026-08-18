/**
 * License Auth Server - C++ 客户端接入与防逆向示例
 *
 * 包含：
 * 1. 机器码 (HWID) 生成
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

// 如果使用 VMProtect，可包含 VMProtectSDK.h
// #include <VMProtectSDK.h>

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
     * 1. 严格选取【不易篡改、更换成本极高】的核心HWID生成唯一机器码 (HWID)
     *
     * 排除易变/低成本项：
     * ❌ 排除 MAC 地址（插拔 Wi-Fi、开关 VPN/虚拟机即变，易被随机伪造）
     * ❌ 排除 逻辑磁盘卷标/分区 ID（格式化/重装系统就会改变）
     *
     * 采纳高防/高成本HWID组合：
     *  1. 主板物理全局唯一 UUID (Motherboard System UUID) - 更换主板相当于换整机，成本最高
     *  2. 主板出厂HWID (BaseBoard Serial Number) - 出厂硬编码在电路板芯片
     *  3. CPU 处理器架构与特征签名 (CPUID Processor Signature) - CPU 物理熔断特征，换 CPU 成本极高
     *  4. 系统主固态/物理硬盘控制器出厂序列号 (Physical NVMe/SATA Controller Serial) - 格式化系统永不改变
     *  5. BIOS ROM 固件序列号 (BIOS Serial) - 烧录于主板 SPI Flash 芯片
     */
    std::string generatehwid() {
        std::stringstream ss;

        // [核心 1] 主板系统全局唯一 UUID (SMBIOS Type 1 System UUID)
        ss << "MB_UUID:" << getMotherboardSystemUuid() << ";";

        // [核心 2] 主板出厂HWID (SMBIOS Type 2 BaseBoard Serial)
        ss << "BOARD_SN:" << getBaseboardSerial() << ";";

        // [核心 3] CPUID 物理特征签名与指令集掩码
        ss << "CPUID:" << getCpuProcessorSignature() << ";";

        // [核心 4] 主物理硬盘控制器HWID (非分区卷标)
        ss << "DISK_HW_SN:" << getPhysicalDiskControllerSerial() << ";";

        // [核心 5] BIOS ROM 芯片序列号
        ss << "BIOS_SN:" << getBiosRomSerial();

        // 统一计算 SHA-256 哈希
        return "HWID-" + sha256(ss.str());
    }

private:
    std::string getDeviceName() {
        // Windows: GetComputerNameA(buf, &size)  #include <windows.h>
        // Linux: gethostname(buf, sizeof(buf))  #include <unistd.h>
        return "DESKTOP-DEVELOPER";
    }

    std::string getMotherboardSystemUuid() {
        // Windows: 获取 SMBIOS Type 1 UUID (例如通过 GetSystemFirmwareTable('RSMB'))
        // Linux: 读取 /sys/class/dmi/id/product_uuid
        return "4C4C4544-004B-4E10-8058-C3C04F343233";
    }

    std::string getBaseboardSerial() {
        // Windows: WMI Win32_BaseBoard -> SerialNumber 或 SMBIOS Type 2
        // 烧录于主板HWID中，更换主板成本等同于换电脑
        return "/8HK3N42/CN12963876002A/";
    }

    std::string getCpuProcessorSignature() {
        // 使用 CPUID 指令 (EAX=1) 获取 CPU 族、型号、步进与扩展特性掩码
        return "BFEBFBFF000806EC";
    }

    std::string getPhysicalDiskControllerSerial() {
        // 通过 DeviceIoControl (IOCTL_STORAGE_QUERY_PROPERTY / StorageDeviceProperty)
        // 直接从 NVMe/SATA 硬盘控制器固件读取出厂唯一HWID（重装系统、分区格式化绝对不变）
        return "NVME_SAMSUNG_MZVLB1T0HALR_S434NY0M123456";
    }

    std::string getBiosRomSerial() {
        // SMBIOS Type 0 读取主板 SPI 芯片烧录的固件序列号
        return "DELL_BIOS_SN_2.18.0";
    }

    std::string sha256(const std::string& input) {
        // 生产环境中引入 OpenSSL / mbedTLS / Windows CNG 计算 SHA-256
        std::hash<std::string> hasher;
        std::stringstream ss;
        ss << std::hex << std::setfill('0') << std::setw(16) << hasher(input)
           << std::setw(16) << hasher(input + "_SALT_SEC");
        return ss.str();
    }

    // 2. 生成随机 Nonce 字符串防重放
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

    // 3. 执行激活与授权验证
    bool verify() {
        // VMProtectBeginMutation("LicenseClient_Verify");

        long long timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()
        ).count();
        std::string nonce = generateNonce();

        std::cout << "[Client] 正在向服务端发起授权验证..." << std::endl;
        std::cout << "  - LicenseKey: " << licenseKey << std::endl;
        std::cout << "  - Software: " << softwareName << std::endl;
        std::cout << "  - hwid: " << hwid << std::endl;
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

    // 4. 后台心跳维持线程
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
