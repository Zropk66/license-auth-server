# Python 客户端接入指南

## 1. 高防高成本物理硬件指纹 (High-Cost HWID)
* **零外部第三方依赖**（使用 Python 标准库 `urllib.request`、`threading`、`secrets`）。
* **严格剔除低成本易变项**：已排除易被修改/伪造的 MAC 地址、格式化即变的磁盘分区卷标。
* **锁定 5 大物理高成本硬件**：
  1. 主板系统全局唯一 UUID (Motherboard System UUID)
  2. 主板出厂硬件序列号 (BaseBoard Serial Number)
  3. CPU 物理微架构特征与核心 ID (CPU Processor ID)
  4. 系统物理硬盘出厂硬件序列号 (Physical NVMe/SATA Controller Serial，重装系统绝对不变)
  5. BIOS ROM 固件序列号 (BIOS Serial)
* **安全收敛**：拼接后通过 SHA-256 加密输出唯一 32 位机器码。

## 2. 快速使用
```python
from license_client import LicenseClient

client = LicenseClient("http://localhost:3000", "YOUR-LICENSE-KEY", "MyApp")
if client.verify():
    print("授权通过，执行主程序...")
else:
    print("授权失败！")
```
