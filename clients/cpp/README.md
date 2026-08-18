# C++ 客户端接入与加固指南

## 1. 高成本、不易更改硬件特征码 (High-Cost HWID)
为防止虚拟机克隆、MAC 伪造或用户重装系统导致机器码改变，严格结合以下 5 大**物理高成本**硬件属性：
1. **主板系统全局唯一 UUID (Motherboard System UUID)**：SMBIOS Type 1，更换主板成本等同于换整机。
2. **主板出厂硬件序列号 (BaseBoard Serial Number)**：SMBIOS Type 2，出厂硬编码。
3. **CPU 处理器核心微架构与特性掩码 (CPUID Signature)**：EAX=1 CPU 核心物理特征，更换成本极高。
4. **系统主固态/物理硬盘控制器出厂序列号 (Physical NVMe/SATA Controller Serial)**：控制器固件硬编码，格式化系统、重装系统绝对不变（彻底排除逻辑卷标）。
5. **BIOS ROM 固件序列号 (BIOS SPI Flash Serial)**：主板出厂烧录。

> ❌ **已彻底排除低成本/易变属性**：MAC 地址（易变/可被软件随机伪造）、磁盘分区卷标（格式化即变）。

## 2. 核心验证流程
1. **生成 Composite HWID**：采集上述 5 大核心硬件，经 SHA-256 计算输出 32 位机器码。
2. **生成随机 Nonce 与当前毫秒时间戳**：防网络抓包与重放攻击。
3. **调用 `/api/license-verification/verify`**：提交卡密与硬件 ID。
4. **Ed25519 本地非对称公钥验签**：验证返回数据由官方私钥签名，防抓包 Hook 篡改响应。
5. **开启后台心跳线程**：按指定间隔向 `/api/license-verification/heartbeat` 发送心跳。

## 3. 反逆向与安全加固建议
* **代码虚拟化 (VMProtect / Themida)**：
  * 将 `verify()` 关键代码块置于 `VMProtectBeginMutation` 或 `VMProtectBeginVirtualization` 保护区内。
  * 将服务端的 Ed25519 Public Key 进行动态解密拼接，避免明文字符串出现在二进制 `strings` 中。
* **时钟防倒拨**：
  * 对比系统开机运行时间 `GetTickCount64()` 与上次心跳时间，防止用户修改本地时间作弊。
