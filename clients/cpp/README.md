# C++ 客户端（v2 信封加密传输）

接入 License Auth Server 的 Windows C++ 客户端，全链路加密传输 + 响应签名验证。

## 1. 传输协议（v2 信封加密）

所有请求/响应均为密文，中间人（Burp/Fiddler/运营商）只能看到随机字节：

```
请求  POST { "v": 2,
             "envelope": base64(RSA-OAEP-SHA256(公钥, 会话密钥32B)),
             "payload":  "iv:tag:ct" }        ← AES-256-GCM(会话密钥, 请求JSON)

响应  { "v": 2, "payload": "iv:tag:ct" }      ← AES-256-GCM(同一会话密钥, 响应JSON)
```

- **会话密钥**：每请求随机生成 32 字节，仅存双方内存，不落盘、不跨请求
- **响应验证**：`data` 对象由服务端 Ed25519 私钥签名（sign-then-encrypt），
  客户端用内置公钥验签 + 时间戳新鲜度校验（±5 分钟，防重放）
- **防重放**：每请求随机 nonce + 毫秒时间戳，服务端 `validateNonce` 校验
- **乱文响应**：服务端无法解密的请求一律返回随机字节（外形一致），不泄露失败原因

密钥体系（`keys.h`，由 `node update-keys.js` 从服务端 `.env` 自动生成）：

| 密钥 | 算法 | 存放 | 用途 |
|---|---|---|---|
| RSA-2048 公钥 | RSA-OAEP-SHA256 | 内嵌客户端 | 包裹会话密钥（保密性） |
| Ed25519 公钥 | Ed25519 | 内嵌客户端 | 响应验签（真实性） |
| RSA-2048 / Ed25519 私钥 | — | 仅服务端 `.env` | 解信封 / 签名 |

> 密钥轮换：服务端重新生成密钥后，重跑 `node update-keys.js` 并重新编译客户端。

## 2. 文件结构

| 文件 | 职责 |
|---|---|
| `main.cpp` | LicenseClient：HWID 采集、验证、心跳、版本检查 |
| `secure_transport.h/cpp` | v2 信封协议：组包/解包、Ed25519 验签、时间戳校验 |
| `crypto.h/cpp` | Windows CNG：RSA-OAEP、AES-256-GCM、SHA-256、CSPRNG |
| `ed25519_verify.h` | TweetNaCl 封装的 Ed25519 验签（CNG 不支持 Ed25519） |
| `ed25519/` | TweetNaCl 源码（公有域） |
| `http.h/cpp` | WinHTTP 封装，支持 `HTTPS_PROXY` 抓包测试 |
| `json_mini.h` | 最小 JSON 提取器（`GetRawObject` 保证验签字节级精确） |
| `keys.h` | 内嵌公钥（自动生成） |
| `test-server.js` | 本地协议测试服务器（与生产协议逐字节一致） |
| `update-keys.js` | 从 `.env` 生成 `keys.h` |
| `build.bat` / `build.ps1` | MSVC 构建脚本 |

## 3. 构建与运行

```powershell
# 自动定位 MSVC 并编译（需 Visual Studio 含 C++ 工具链）
powershell -ExecutionPolicy Bypass -File build.ps1

# 运行（参数均可省略，默认取内置值）
.\license-client.exe [serverUrl] [licenseKey] [softwareName]
```

## 4. 本地协议回归测试（不依赖数据库）

```powershell
# 终端 1：启动协议测试服务器（使用 .env 真实密钥对）
node test-server.js

# 终端 2：三个客户端任选
.\license-client.exe http://127.0.0.1:3080
node ..\..\test-client\client.js        # 菜单客户端
python ..\python\license_client.py ..\..\test-client\config.json http://127.0.0.1:3080
```

## 5. HWID（高成本硬件特征码）

采集 4 大**物理高成本**硬件属性，SHA-256 组合生成：

1. **主板 UUID**（SMBIOS Type 1）— 更换主板成本等同换整机
2. **主板序列号**（SMBIOS Type 2）— 出厂硬编码
3. **CPU ProcessorId** — 处理器物理特征
4. **BIOS 序列号** — 主板出厂烧录

> ❌ 排除低成本/易变属性：MAC 地址（可软件伪造）、磁盘卷标（格式化即变）。
> 全部标识无效时进程直接终止，不使用任何随机降级。

## 6. 反逆向与加固建议

* **代码虚拟化（VMProtect / Themida）**：
  * `verify()` 关键块置于 `VMProtectBeginMutation` / `VMProtectBeginVirtualization` 保护区内（代码中已留插桩点）
  * Ed25519 公钥做动态解密拼接，避免明文出现在二进制 `strings` 中
* **时钟防倒拨**：对比 `GetTickCount64()` 与上次心跳时间，防本地改时间作弊
* **心跳 fail-closed**：连续 3 次传输失败 / 会话状态非 active / 服务端拒绝 → 立即停止业务授权

## 7. 抓包测试（Burp Suite）

```powershell
$env:HTTPS_PROXY = "http://127.0.0.1:8080"
.\license-client.exe
```

> 在 Burp 中只能看到 `{"v":2,"envelope":"...","payload":"..."}` 随机密文，无法查看或修改任何业务字段；
> 篡改任意字节将导致 AES-GCM 认证标签校验失败，客户端直接拒绝响应。
