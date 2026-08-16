# 许可证验证 API 文档

本文档提供了有关如何将许可证验证 API 集成到您的软件应用程序中的详细信息。

## 概述

许可证管理系统提供了一个安全的 API 端点，用于在您的软件产品中验证许可证。该 API 对所有请求和响应均使用 AES 加密，以确保许可证密钥和其他敏感信息的安全。

## 端点

```
POST /api/license-verification/verify
```

## 安全实现

与 API 的所有通信均使用 AES（高级加密标准）进行加密。这意味着：

1. 您的软件在发送之前必须加密请求数据
2. API 响应将被加密，且必须由您的软件进行解密
3. 您需要共享密钥（`AES_SECRET_KEY`）来进行加密和解密

这种方法可防止许可证密钥和硬件 ID 在传输过程中泄露，并使恶意用户更难对验证过程进行逆向工程。

## 请求格式

所有请求必须以 `text/plain` 内容类型发送，并将加密的有效负载作为请求的主体。

### 有效负载结构（加密前）

```json
{
  "licenseKey": "XXXX-XXXX-XXXX-XXXX",
  "hardwareId": "可选硬件标识符"
}
```

- `licenseKey`（必需）：要验证的许可证密钥
- `hardwareId`（可选）：硬件的唯一标识符。如果许可证启用了硬件绑定，则为必需项。

## 响应格式

响应将是一个包含 AES 加密响应有效负载的纯文本字符串。

### 成功响应有效负载（解密后）

```json
{
  "valid": true,
  "licenseKey": "XXXX-XXXX-XXXX-XXXX",
  "username": "张三",
  "softwareName": "您的软件",
  "expirationDate": "2025-12-31T23:59:59.999Z",
  "hardwareBindingEnabled": true,
  "status": "active"
}
```

### 错误响应有效负载（解密后）

```json
{
  "error": "描述问题的错误信息"
}
```

可能的错误信息：
- "Invalid license key"（无效的许可证密钥）
- "License has been revoked"（许可证已被吊销）
- "License has expired"（许可证已过期）
- "License is bound to a different hardware ID"（许可证已绑定到其他硬件 ID）
- "Hardware ID is required for this license"（此许可证需要硬件 ID）

## 集成示例

### JavaScript/TypeScript

```javascript
// 使用 Node.js 原生 crypto 模块进行加密/解密
const crypto = require('crypto');

const AES_SECRET_KEY = 'your-aes-secret-key'; // 从安全配置中获取
const API_URL = 'https://yourdomain.com/api/license-verification/verify';

// 派生 32 字节密钥
function getEncryptionKey(secret) {
  return crypto.createHash('sha256').update(secret).digest();
}

// 加密数据函数
function encryptData(data) {
  const key = getEncryptionKey(AES_SECRET_KEY);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

// 解密响应函数
function decryptData(encryptedData) {
  const parts = encryptedData.split(':');
  if (parts.length !== 2) {
    throw new Error('解密失败：密文格式不正确');
  }
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts[1];
  const key = getEncryptionKey(AES_SECRET_KEY);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}
```
  
  if (!decryptedData) {
    throw new Error('解密失败');
  }
  
  return JSON.parse(decryptedData);
}

// 验证许可证函数
async function verifyLicense(licenseKey, hardwareId = null) {
  try {
    // 准备数据负载
    const payload = { licenseKey };
    if (hardwareId) {
      payload.hardwareId = hardwareId;
    }
    
    // 加密有效负载
    const encryptedPayload = encryptData(payload);
    
    // 向 API 发送请求
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: encryptedPayload,
    });
    
    // 获取加密后的响应文本
    const encryptedResponse = await response.text();
    
    // 解密响应
    const result = decryptData(encryptedResponse);
    
    // 检查错误
    if (result.error) {
      console.error('许可证验证失败:', result.error);
      return { valid: false, error: result.error };
    }
    
    // 返回成功验证
    return result;
  } catch (error) {
    console.error('许可证验证出错:', error);
    return { valid: false, error: error.message };
  }
}

// 使用示例
async function checkLicense() {
  const licenseKey = 'ABCD-1234-EFGH-5678';
  const hardwareId = generateHardwareId(); // 实现一个生成唯一硬件 ID 的函数
  
  const result = await verifyLicense(licenseKey, hardwareId);
  
  if (result.valid) {
    console.log('许可证有效！');
    console.log('过期时间:', new Date(result.expirationDate).toLocaleDateString());
    // 继续进行软件初始化
  } else {
    console.error('许可证验证失败:', result.error);
    // 向用户显示错误
  }
}

// 生成硬件 ID 的示例函数（根据您的要求进行实现）
function generateHardwareId() {
  // 这应该基于硬件组件生成一个唯一的 ID
  // 示例：CPU ID + 硬盘序列号 + MAC 地址哈希
  // 在此示例中，我们仅返回一个虚拟值
  return 'sample-hardware-id-12345';
}
```

### C#（使用 .NET）

```csharp
using System;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

public class LicenseVerifier
{
    private readonly string _aesKey;
    private readonly string _apiUrl;
    private readonly HttpClient _httpClient;

    public LicenseVerifier(string aesKey, string apiUrl)
    {
        _aesKey = aesKey;
        _apiUrl = apiUrl;
        _httpClient = new HttpClient();
    }

    public async Task<LicenseVerificationResult> VerifyLicenseAsync(string licenseKey, string hardwareId = null)
    {
        try
        {
            // 创建请求有效负载
            var payload = new LicenseVerificationRequest
            {
                LicenseKey = licenseKey,
                HardwareId = hardwareId
            };

            // 加密有效负载
            var encryptedPayload = EncryptData(payload);

            // 发送请求
            var response = await _httpClient.PostAsync(_apiUrl, new StringContent(
                encryptedPayload,
                Encoding.UTF8,
                "text/plain"
            ));

            // 获取加密后的响应
            var encryptedResponse = await response.Content.ReadAsStringAsync();

            // 解密响应
            var result = DecryptResponse(encryptedResponse);

            return result;
        }
        catch (Exception ex)
        {
            return new LicenseVerificationResult
            {
                Valid = false,
                Error = $"验证错误: {ex.Message}"
            };
        }
    }

    private string EncryptData(LicenseVerificationRequest request)
    {
        var json = JsonSerializer.Serialize(request);
        var keyBytes = Encoding.UTF8.GetBytes(_aesKey);
        
        // 使用密钥的前 32 字节（如果较短则进行填充）
        if (keyBytes.Length != 32)
        {
            Array.Resize(ref keyBytes, 32);
        }
        
        using var aes = Aes.Create();
        aes.Key = keyBytes;
        aes.GenerateIV(); // 生成随机 IV
        
        using var encryptor = aes.CreateEncryptor(aes.Key, aes.IV);
        using var ms = new System.IO.MemoryStream();
        
        // 将 IV 写入流的开头
        ms.Write(aes.IV, 0, aes.IV.Length);
        
        using (var cs = new CryptoStream(ms, encryptor, CryptoStreamMode.Write))
        {
            using var sw = new System.IO.StreamWriter(cs);
            sw.Write(json);
        }
        
        return Convert.ToBase64String(ms.ToArray());
    }

    private LicenseVerificationResult DecryptResponse(string encryptedResponse)
    {
        try
        {
            var cipherBytes = Convert.FromBase64String(encryptedResponse);
            var keyBytes = Encoding.UTF8.GetBytes(_aesKey);
            
            // 使用密钥的前 32 字节（如果较短则进行填充）
            if (keyBytes.Length != 32)
            {
                Array.Resize(ref keyBytes, 32);
            }
            
            using var aes = Aes.Create();
            aes.Key = keyBytes;
            
            // IV 为前 16 字节
            byte[] iv = new byte[16];
            Array.Copy(cipherBytes, 0, iv, 0, 16);
            aes.IV = iv;
            
            using var decryptor = aes.CreateDecryptor(aes.Key, aes.IV);
            using var ms = new System.IO.MemoryStream(cipherBytes, 16, cipherBytes.Length - 16);
            using var cs = new CryptoStream(ms, decryptor, CryptoStreamMode.Read);
            using var sr = new System.IO.StreamReader(cs);
            
            var jsonResponse = sr.ReadToEnd();
            return JsonSerializer.Deserialize<LicenseVerificationResult>(jsonResponse, 
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch (Exception ex)
        {
            return new LicenseVerificationResult
            {
                Valid = false,
                Error = $"解密错误: {ex.Message}"
            };
        }
    }

    // 辅助类，用于序列化
    public class LicenseVerificationRequest
    {
        public string LicenseKey { get; set; }
        public string HardwareId { get; set; }
    }

    public class LicenseVerificationResult
    {
        public bool Valid { get; set; }
        public string LicenseKey { get; set; }
        public string Username { get; set; }
        public string SoftwareName { get; set; }
        public DateTime ExpirationDate { get; set; }
        public bool HardwareBindingEnabled { get; set; }
        public string Status { get; set; }
        public string Error { get; set; }
    }
}

// 使用示例
public class Program
{
    public static async Task Main()
    {
        // 初始化许可证验证器
        var verifier = new LicenseVerifier(
            "your-aes-secret-key", 
            "https://yourdomain.com/api/license-verification/verify"
        );
        
        // 生成硬件 ID
        string hardwareId = GenerateHardwareId();
        
        // 验证许可证
        var result = await verifier.VerifyLicenseAsync("ABCD-1234-EFGH-5678", hardwareId);
        
        if (result.Valid)
        {
            Console.WriteLine("许可证有效！");
            Console.WriteLine($"过期时间: {result.ExpirationDate.ToShortDateString()}");
            // 初始化您的软件
        }
        else
        {
            Console.WriteLine($"许可证验证失败: {result.Error}");
            // 向用户显示错误
        }
    }
    
    // 简单硬件 ID 生成器示例
    private static string GenerateHardwareId()
    {
        // 在实际实现中，收集唯一的硬件标识符
        // 示例：CPU ID、主板序列号等。
        
        // 这是一个简化的示例 - 请实现一个合适的硬件指纹方法
        string machineName = Environment.MachineName;
        string processorId = GetProcessorId(); // 实现此方法
        
        // 从组合值创建唯一哈希
        using var sha = SHA256.Create();
        var hashBytes = sha.ComputeHash(Encoding.UTF8.GetBytes($"{machineName}|{processorId}"));
        return Convert.ToBase64String(hashBytes);
    }
    
    private static string GetProcessorId()
    {
        // 实现获取处理器 ID 的硬件相关代码
        // 这将因操作系统而异
        return "SAMPLE-PROCESSOR-ID";
    }
}
```

### Python

```python
import json
import base64
import requests
from Cryptodome.Cipher import AES
from Cryptodome.Util.Padding import pad, unpad
import platform
import uuid
import hashlib

class LicenseVerifier:
    def __init__(self, aes_key, api_url):
        self.aes_key = aes_key.encode('utf-8')
        self.api_url = api_url
    
    def encrypt_payload(self, payload):
        # 将有效负载转换为 JSON 字符串
        json_payload = json.dumps(payload)
        
        # 创建 CBC 模式的 AES 密码对象
        cipher = AES.new(self.aes_key, AES.MODE_CBC)
        
        # 填充数据，使其成为 block_size 的倍数
        padded_data = pad(json_payload.encode('utf-8'), AES.block_size)
        
        # 加密数据
        encrypted_data = cipher.encrypt(padded_data)
        
        # 合并 IV 和加密数据
        result = cipher.iv + encrypted_data
        
        # 返回 base64 字符串
        return base64.b64encode(result).decode('utf-8')
    
    def decrypt_response(self, encrypted_response):
        # 从 base64 转换
        encrypted_data = base64.b64decode(encrypted_response)
        
        # 提取 IV（前 16 字节）
        iv = encrypted_data[:16]
        ciphertext = encrypted_data[16:]
        
        # 使用提取 of IV 创建密码对象
        cipher = AES.new(self.aes_key, AES.MODE_CBC, iv)
        
        # 解密并去填充
        decrypted_data = unpad(cipher.decrypt(ciphertext), AES.block_size)
        
        # 解析 JSON
        return json.loads(decrypted_data.decode('utf-8'))
    
    def verify_license(self, license_key, hardware_id=None):
        try:
            # 准备有效负载
            payload = {"licenseKey": license_key}
            if hardware_id:
                payload["hardwareId"] = hardware_id
            
            # 加密有效负载
            encrypted_payload = self.encrypt_payload(payload)
            
            # 发送请求
            response = requests.post(
                self.api_url,
                data=encrypted_payload,
                headers={"Content-Type": "text/plain"}
            )
            
            # 获取加密后的响应
            encrypted_response = response.text
            
            # 解密响应
            result = self.decrypt_response(encrypted_response)
            
            return result
        except Exception as e:
            return {"valid": False, "error": f"验证错误: {str(e)}"}

def generate_hardware_id():
    """生成唯一的硬件标识符。"""
    # 收集硬件信息
    system_info = platform.system() + platform.version()
    processor = platform.processor()
    machine_id = str(uuid.getnode())  # MAC 地址转换为整数
    
    # 组合信息并创建哈希
    combined = f"{system_info}|{processor}|{machine_id}"
    hardware_id = hashlib.sha256(combined.encode()).hexdigest()
    
    return hardware_id

# 使用示例
if __name__ == "__main__":
    # 初始化验证器
    verifier = LicenseVerifier(
        aes_key="your-aes-secret-key",
        api_url="https://yourdomain.com/api/license-verification/verify"
    )
    
    # 生成硬件 ID
    hardware_id = generate_hardware_id()
    
    # 验证许可证
    license_key = "ABCD-1234-EFGH-5678"
    result = verifier.verify_license(license_key, hardware_id)
    
    if result.get("valid"):
        print("许可证有效！")
        print(f"过期时间: {result.get('expirationDate')}")
        # 继续进行软件初始化
    else:
        print(f"许可证验证失败: {result.get('error')}")
        # 向用户显示错误
```

## 硬件 ID 生成

对于绑定硬件的许可证，您应该生成一个唯一的硬件标识符，该标识符对于特定设备保持一致。以下是不同平台的一些方法：

### Windows
- 使用 WMI 收集硬件信息（CPU ID、主板序列号、硬盘序列号等）
- 对组合值进行哈希以创建稳定的标识符

### macOS
- 使用 IOKit 收集硬件序列号
- 系统配置器获取硬件信息
- 哈希收集到的值

### Linux
- 从 `/proc` 和 `/sys` 目录读取系统信息
- 收集网络接口 MAC 地址
- 使用 `dmidecode` 获取硬件信息

### 跨平台方法
- 针对 Node.js，使用 `node-machine-id` 等库
- 结合多个标识符（硬盘序列号、网络 MAC 地址、CPU 信息）
- 应用一致的哈希算法以保持稳定性

## 最佳实践

1. **错误处理**：始终妥善处理许可证验证过程中的潜在错误。向用户提供清晰的错误信息。

2. **离线宽限期**：考虑实施离线宽限期，在没有验证的情况下，软件仍可在有限的时间内继续正常运行。

3. **安全存储**：在应用程序中安全存储 AES 密钥，使用特定于平台的方法：
   - Windows：DPAPI 或安全注册表存储
   - macOS：Keychain
   - Linux：Secret Service API

4. **代码混淆**：应用代码混淆以使攻击者更难定位和修改许可证验证逻辑。

5. **反调试**：实施基本的反调试措施，防止对验证系统进行简单分析。

6. **定期验证**：对于能够持续访问互联网的软件，定期重新验证许可证，而不是仅在启动时进行检查。

7. **后备机制**：实施二级验证方法，作为主要机制失败时的备用。

## 响应状态码

API 可能会返回以下 HTTP 状态码：

- **200 OK**：请求成功（在加密的响应体中包含有效许可证或错误信息）
- **400 Bad Request**：请求格式错误或缺少必需数据
- **500 Internal Server Error**：许可证验证期间服务器端出错

请注意，所有错误详细信息均包含在加密的响应体中，而不是包含在 HTTP 状态码中。

## 安全注意事项

- 确保您的 AES 密钥安全，切勿直接在软件中硬编码。
- 考虑使用软件保护/混淆工具以增加逆向工程的难度。
- 监控并限制 API 请求速率以防止暴力破解攻击。
- 实施安全更新机制，以部署许可证验证系统中发现的任何安全漏洞的修复程序。
