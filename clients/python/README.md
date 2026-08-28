# Python 客户端接入指南（v2 信封加密传输）

接入 License Auth Server 的 Python 客户端 SDK，全链路加密传输 + 响应签名验证。

## 1. 传输协议（v2 信封加密）

```
请求  POST { "v": 2,
             "envelope": base64(RSA-OAEP-SHA256(公钥, 会话密钥32B)),
             "payload":  "iv:tag:ct" }        ← AES-256-GCM(会话密钥, 请求JSON)

响应  { "v": 2, "payload": "iv:tag:ct" }      ← AES-256-GCM(同一会话密钥, 响应JSON)
```

- **会话密钥**：每请求随机生成 32 字节（`os.urandom`），仅存内存、不落盘
- **响应验证**：`data` 对象由服务端 Ed25519 私钥签名（sign-then-encrypt），
  客户端用公钥验签 + 时间戳新鲜度校验（±5 分钟，防重放）
- **防重放**：每请求随机 nonce + 毫秒时间戳
- **心跳 fail-closed**：连续 3 次传输失败 / 会话状态非 active / 被拒绝 → 停止授权

## 2. 依赖安装

```bash
pip install -r requirements.txt   # cryptography>=41.0
```

## 3. 快速使用

```python
from license_client import LicenseClient

# 公钥内嵌于客户端（非秘密），须与服务端 .env 私钥配对
client = LicenseClient(
    server_url="https://license.zropk.icu",
    license_key="YOUR-LICENSE-KEY",
    software_name="MyApp",
    rsa_public_key_pem=open("rsa_public.pem").read(),     # RSA-2048 公钥（PEM）
    ed25519_public_key_pem=open("ed25519_public.pem").read(),  # Ed25519 公钥（PEM）
)
if client.verify():
    client.check_update("1.0.0", "100")   # 可选：版本检查
    print("授权通过，执行主程序...")
    client.close()
else:
    print("授权失败！")
```

命令行演示（自动加载 `test-client/config.json`，可覆盖服务器地址用于本地联调）：

```bash
python license_client.py [config.json] [serverUrl]
```

## 4. 高防高成本物理硬件指纹 (High-Cost HWID)

* **严格剔除低成本易变项**：已排除易被修改/伪造的 MAC 地址、格式化即变的磁盘分区卷标。
* **锁定 4 大物理高成本硬件**：
  1. 主板系统全局唯一 UUID (Motherboard System UUID)
  2. 主板出厂硬件序列号 (BaseBoard Serial)
  3. CPU 物理微架构特征与核心 ID (CPU Processor ID)
  4. BIOS ROM 固件序列号 (BIOS Serial)
* **安全收敛**：拼接后通过 SHA-256 输出唯一机器码；全部标识无效时进程终止，不使用随机降级。

## 5. 本地协议回归测试（不依赖数据库）

```bash
# 终端 1：启动协议测试服务器（位于 clients/cpp，使用 .env 真实密钥对）
node ../cpp/test-server.js

# 终端 2
python license_client.py ../../test-client/config.json http://127.0.0.1:3080
```
