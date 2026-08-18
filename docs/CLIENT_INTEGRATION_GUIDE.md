# 客户端通用接入与安全适配指南

本文档介绍客户端如何与 **Ed25519 非对称签名 ＋ HTTPS** 授权服务端进行标准化对接。

---

## 一、 通信协议与公钥规范

### 1. 公钥获取与格式
在服务端根目录下运行 `npm run generate-keys` 生成密钥对后，将公钥嵌入客户端：

* **SPKI PEM 格式**：
  ```
  -----BEGIN PUBLIC KEY-----
  YOUR_ED25519_PUBLIC_KEY_BASE64_HERE
  -----END PUBLIC KEY-----
  ```
* **原始 32 字节 Public Key (Hex 格式)**：
  `YOUR_32_BYTE_ED25519_PUBLIC_KEY_HEX_HERE`

### 2. 接口协议定义

| 接口 | 方法 | 请求载荷 | 响应格式 |
| :--- | :--- | :--- | :--- |
| **`/api/license-verification/verify`** | `POST` | `{"licenseKey": "...", "hardwareId": "..."}` | `{"data": {...}, "signature": "128位Hex"}` |
| **`/api/license-verification/heartbeat`** | `POST` | `{"licenseKey": "...", "hardwareId": "...", "sessionId": "..."}` | `{"data": {...}, "signature": "128位Hex"}` |
| **`/api/license-verification/offline`** | `POST` | `{"licenseKey": "...", "hardwareId": "...", "sessionId": "..."}` | `{"success": true, "message": "..."}` |

---

## 二、 标准接入流程

### 第 1 步：生成/采集硬件特征
* **做法**：读取主板 UUID、CPU 序列号、系统盘序列号或网卡 MAC 地址，拼接后进行 `SHA-256` 哈希，格式化为唯一硬件识别串 `HW-A1B2C3D4E5F6`。
* **安全建议**：采集逻辑放入加壳保护区，防止被 Hook API 篡改。

### 第 2 步：首次激活验证
1. 客户端向 `/api/license-verification/verify` 发送 `licenseKey` 与 `hardwareId`。
2. 收到服务端回包：
   * **若 HTTP 状态非 200**：提取 `message` 字段向用户展示错误原因。
   * **若 HTTP 200 成功**：
     1. 取出 `response.data` 并序列化为标准 JSON UTF-8 字节流。
     2. 取出 `response.signature`。
     3. 使用内置的 **Ed25519 公钥** 进行数字验签。
     4. **验签失败**：直接触发自毁/退出。
     5. **验签成功**：提取 `sessionId` 存入内存，准备开启心跳。

### 第 3 步：后台心跳维持
1. 启动独立后台工作线程，按服务端指定的 `heartbeatInterval` 向 `/heartbeat` 发送维持包。
2. 每次心跳收到 `200` 响应同样进行**公钥验签**，验签通过刷新内存活跃看门狗时间戳。
3. **若收到 401**：
   * 判定：管理员已在后台重置了硬件绑定或将当前会话强制下线。
   * 处理：停止心跳线程，清空本地保存的 `sessionId`，弹窗提示用户后退回登录界面。

---

## 三、 各语言推荐密码学选型

客户端调用各语言的 Ed25519 标准库：

| 开发语言 | 推荐依赖库 | 核心验签 API |
| :--- | :--- | :--- |
| **C / C++** | `libsodium` / `OpenSSL 3.x` | `crypto_sign_verify_detached` |
| **C# .NET** | `NSec.Cryptography` / `BouncyCastle` | `SignatureAlgorithm.Ed25519.Verify` |
| **Golang** | `crypto/ed25519` | `ed25519.Verify` |
| **Rust** | `ed25519-dalek` | `VerifyingKey::verify` |
| **Python** | `cryptography` / `PyNaCl` | `Ed25519PublicKey.verify` |
| **Java / Android** | `BouncyCastle` / `Java 15+` | `Ed25519Signer` |
| **Node / Electron** | `crypto` | `crypto.verify` |

---

## 四、 核心安全加固规范

1. **公钥与验签逻辑进虚拟机保护区**：
   * 客户端编译后必须使用 **VMP / Themida** 对公钥常量与验签函数进行代码虚拟化，防止公钥被替换或逻辑被修改。
2. **禁止依赖全局布尔变量**：
   * 避免只在入口做单点判定。
   * 关键业务功能依赖服务端返回的动态参数进行运算。
3. **心跳联动与暗桩延时**：
   * 多处业务模块抽检心跳看门狗时间戳。
   * 遭遇异常时避免立即闪退，可随机延迟后静默损坏计算数据，增加逆向调试成本。
