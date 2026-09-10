'use client';

import { useState } from 'react';
import AdminLayout from '@/components/admin/admin-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Code2, Copy, Check, ShieldCheck, Zap, Activity, Unlink, Lock, Terminal } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function ApiDocsPage() {
  const { toast } = useToast();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast({
      title: '已复制到剪贴板',
      description: 'SDK 代码片段已成功复制',
    });
    setTimeout(() => {
      setCopiedId((curr) => (curr === id ? null : curr));
    }, 2000);
  };

  const csharpCode = `using System;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace LicenseAuthClient
{
    public class LicenseClient
    {
        private readonly HttpClient _httpClient = new HttpClient();
        private readonly string _serverBaseUrl;
        private readonly RSA _serverRsaPublicKey;

        public LicenseClient(string baseUrl, string serverRsaPubPem)
        {
            _serverBaseUrl = baseUrl.TrimEnd('/');
            _serverRsaPublicKey = RSA.Create();
            _serverRsaPublicKey.ImportFromPem(serverRsaPubPem.ToCharArray());
        }

        public async Task<string> VerifyLicenseAsync(string licenseKey, string softwareName, string hwid, string deviceName = null)
        {
            byte[] sessionKey = new byte[32];
            RandomNumberGenerator.Fill(sessionKey);

            byte[] encryptedSessionKey = _serverRsaPublicKey.Encrypt(sessionKey, RSAEncryptionPadding.OaepSHA256);
            string envelopeBase64 = Convert.ToBase64String(encryptedSessionKey);

            var payloadObject = new
            {
                licenseKey,
                softwareName,
                hwid,
                deviceName,
                nonce = Guid.NewGuid().ToString("N"),
                timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            };

            string jsonPlaintext = JsonSerializer.Serialize(payloadObject);
            string wirePayload = AesGcmEncrypt(sessionKey, Encoding.UTF8.GetBytes(jsonPlaintext));

            var requestBody = new
            {
                v = 2,
                envelope = envelopeBase64,
                payload = wirePayload
            };

            var content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json");
            var response = await _httpClient.PostAsync($"{_serverBaseUrl}/api/license-verification/verify", content);
            response.EnsureSuccessStatusCode();

            string respJson = await response.Content.ReadAsStringAsync();
            using var respDoc = JsonDocument.Parse(respJson);
            string respPayload = respDoc.RootElement.GetProperty("payload").GetString();

            string decryptedJson = AesGcmDecrypt(sessionKey, respPayload);
            return decryptedJson;
        }

        private static string AesGcmEncrypt(byte[] key, byte[] plaintext)
        {
            byte[] iv = new byte[12];
            RandomNumberGenerator.Fill(iv);
            byte[] tag = new byte[16];
            byte[] ciphertext = new byte[plaintext.Length];

            using var aesGcm = new AesGcm(key);
            aesGcm.Encrypt(iv, plaintext, ciphertext, tag);

            return $"{Convert.ToHexString(iv).ToLower()}:{Convert.ToHexString(tag).ToLower()}:{Convert.ToHexString(ciphertext).ToLower()}";
        }

        private static string AesGcmDecrypt(byte[] key, string wirePayload)
        {
            var parts = wirePayload.Split(':');
            byte[] iv = Convert.FromHexString(parts[0]);
            byte[] tag = Convert.FromHexString(parts[1]);
            byte[] ciphertext = Convert.FromHexString(parts[2]);
            byte[] decrypted = new byte[ciphertext.Length];

            using var aesGcm = new AesGcm(key);
            aesGcm.Decrypt(iv, ciphertext, tag, decrypted);
            return Encoding.UTF8.GetString(decrypted);
        }
    }
}`;

  const cppCode = `/**
 * C / C++ 客户端通信示例 (libcurl + OpenSSL 3.0)
 * 编译指令: g++ client.cpp -lcurl -lssl -lcrypto -o license_client
 */

#include <iostream>
#include <string>
#include <vector>
#include <sstream>
#include <iomanip>
#include <curl/curl.h>
#include <openssl/rsa.h>
#include <openssl/pem.h>
#include <openssl/evp.h>
#include <openssl/rand.h>

static size_t WriteCallback(void* contents, size_t size, size_t nmemb, void* userp) {
    ((std::string*)userp)->append((char*)contents, size * nmemb);
    return size * nmemb;
}

std::string HexEncode(const unsigned char* data, size_t len) {
    std::stringstream ss;
    for (size_t i = 0; i < len; ++i) {
        ss << std::hex << std::setw(2) << std::setfill('0') << (int)data[i];
    }
    return ss.str();
}

std::vector<unsigned char> HexDecode(const std::string& hex) {
    std::vector<unsigned char> bytes;
    for (size_t i = 0; i < hex.length(); i += 2) {
        std::string byteString = hex.substr(i, 2);
        unsigned char byte = (unsigned char)strtol(byteString.c_str(), NULL, 16);
        bytes.push_back(byte);
    }
    return bytes;
}

bool EncryptAesGcm(const unsigned char* key, const std::string& plaintext, std::string& outWire) {
    unsigned char iv[12];
    RAND_bytes(iv, sizeof(iv));

    EVP_CIPHER_CTX* ctx = EVP_CIPHER_CTX_new();
    EVP_EncryptInit_ex(ctx, EVP_aes_256_gcm(), NULL, NULL, NULL);
    EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_IVLEN, sizeof(iv), NULL);
    EVP_EncryptInit_ex(ctx, NULL, NULL, key, iv);

    std::vector<unsigned char> ciphertext(plaintext.length());
    int outLen = 0;
    EVP_EncryptUpdate(ctx, ciphertext.data(), &outLen, (const unsigned char*)plaintext.data(), plaintext.length());

    int finalLen = 0;
    EVP_EncryptFinal_ex(ctx, ciphertext.data() + outLen, &finalLen);

    unsigned char tag[16];
    EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_GET_TAG, sizeof(tag), tag);
    EVP_CIPHER_CTX_free(ctx);

    outWire = HexEncode(iv, sizeof(iv)) + ":" + HexEncode(tag, sizeof(tag)) + ":" + HexEncode(ciphertext.data(), ciphertext.size());
    return true;
}

int main() {
    std::cout << "License Auth Client Initialized with v2 Envelope Protocol." << std::endl;
    return 0;
}`;

  const pythonCode = `import json
import uuid
import time
import base64
import requests
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os

class LicenseClient:
    def __init__(self, base_url: str, rsa_public_key_pem: str):
        self.base_url = base_url.rstrip("/")
        self.server_public_key = serialization.load_pem_public_key(
            rsa_public_key_pem.encode("utf-8")
        )

    def verify_license(self, license_key: str, software_name: str, hwid: str, device_name: str = None) -> dict:
        session_key = AESGCM.generate_key(bit_length=256)

        encrypted_session_key = self.server_public_key.encrypt(
            session_key,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None
            )
        )
        envelope_b64 = base64.b64encode(encrypted_session_key).decode("utf-8")

        payload_obj = {
            "licenseKey": license_key,
            "softwareName": software_name,
            "hwid": hwid,
            "deviceName": device_name,
            "nonce": uuid.uuid4().hex,
            "timestamp": int(time.time() * 1000)
        }
        json_bytes = json.dumps(payload_obj, separators=(",", ":")).encode("utf-8")

        iv = os.urandom(12)
        aesgcm = AESGCM(session_key)
        ciphertext_with_tag = aesgcm.encrypt(iv, json_bytes, None)
        ciphertext = ciphertext_with_tag[:-16]
        tag = ciphertext_with_tag[-16:]

        payload_wire = f"{iv.hex()}:{tag.hex()}:{ciphertext.hex()}"

        wire_req = {
            "v": 2,
            "envelope": envelope_b64,
            "payload": payload_wire
        }

        resp = requests.post(f"{self.base_url}/api/license-verification/verify", json=wire_req, timeout=10)
        resp.raise_for_status()

        resp_payload = resp.json()["payload"]
        resp_iv_hex, resp_tag_hex, resp_ct_hex = resp_payload.split(":")
        resp_iv = bytes.fromhex(resp_iv_hex)
        resp_tag = bytes.fromhex(resp_tag_hex)
        resp_ct = bytes.fromhex(resp_ct_hex)

        decrypted_bytes = aesgcm.decrypt(resp_iv, resp_ct + resp_tag, None)
        return json.loads(decrypted_bytes.decode("utf-8"))

# 使用示例
# client = LicenseClient("https://auth.example.com", "-----BEGIN PUBLIC KEY-----\\n...")
# result = client.verify_license("VIP-8888-8888-8888-8888", "MyAwesomeApp", "HWID-X1Y2Z3")
# print(result)
`;

  const goCode = `package main

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type LicenseClient struct {
	BaseURL         string
	ServerPublicKey *rsa.PublicKey
	HTTPClient      *http.Client
}

func NewLicenseClient(baseURL, pemKey string) (*LicenseClient, error) {
	block, _ := pem.Decode([]byte(pemKey))
	if block == nil {
		return nil, errors.New("failed to parse PEM block")
	}
	pubInterface, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	rsaPub, ok := pubInterface.(*rsa.PublicKey)
	if !ok {
		return nil, errors.New("not an RSA public key")
	}
	return &LicenseClient{
		BaseURL:         strings.TrimRight(baseURL, "/"),
		ServerPublicKey: rsaPub,
		HTTPClient:      &http.Client{Timeout: 10 * time.Second},
	}, nil
}

func (c *LicenseClient) Verify(licenseKey, softwareName, hwid, deviceName string) (map[string]interface{}, error) {
	sessionKey := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, sessionKey); err != nil {
		return nil, err
	}

	encryptedSessionKey, err := rsa.EncryptOAEP(sha256.New(), rand.Reader, c.ServerPublicKey, sessionKey, nil)
	if err != nil {
		return nil, err
	}
	envelope := base64.StdEncoding.EncodeToString(encryptedSessionKey)

	payloadMap := map[string]interface{}{
		"licenseKey":   licenseKey,
		"softwareName": softwareName,
		"hwid":         hwid,
		"deviceName":   deviceName,
		"nonce":        fmt.Sprintf("%d", time.Now().UnixNano()),
		"timestamp":    time.Now().UnixMilli(),
	}
	plaintext, _ := json.Marshal(payloadMap)

	block, err := aes.NewCipher(sessionKey)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	iv := make([]byte, 12)
	if _, err := io.ReadFull(rand.Reader, iv); err != nil {
		return nil, err
	}

	sealed := gcm.Seal(nil, iv, plaintext, nil)
	tag := sealed[len(sealed)-16:]
	ciphertext := sealed[:len(sealed)-16]

	wirePayload := fmt.Sprintf("%s:%s:%s", hex.EncodeToString(iv), hex.EncodeToString(tag), hex.EncodeToString(ciphertext))

	reqBody, _ := json.Marshal(map[string]interface{}{
		"v":        2,
		"envelope": envelope,
		"payload":  wirePayload,
	})

	resp, err := c.HTTPClient.Post(c.BaseURL+"/api/license-verification/verify", "application/json", bytes.NewReader(reqBody))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var wireResp struct {
		V       int    \`json:"v"\`
		Payload string \`json:"payload"\`
	}
	if err := json.NewDecoder(resp.Body).Decode(&wireResp); err != nil {
		return nil, err
	}

	parts := strings.Split(wireResp.Payload, ":")
	if len(parts) != 3 {
		return nil, errors.New("invalid wire payload format")
	}

	respIV, _ := hex.DecodeString(parts[0])
	respTag, _ := hex.DecodeString(parts[1])
	respCT, _ := hex.DecodeString(parts[2])

	fullCiphertext := append(respCT, respTag...)
	decrypted, err := gcm.Open(nil, respIV, fullCiphertext, nil)
	if err != nil {
		return nil, errors.New("failed to decrypt response")
	}

	var result map[string]interface{}
	if err := json.Unmarshal(decrypted, &result); err != nil {
		return nil, err
	}
	return result, nil
}
`;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">开发接口与客户端 SDK</h1>
          <p className="text-sm text-muted-foreground mt-1">
            系统核心授权验证协议规范、端点文档及多语言开箱即用客户端接入代码
          </p>
        </div>

        {/* 协议与安全机制概览 */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                v2 信封加密通道
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1">
              <p>客户端每请求随机生成 32 字节会话密钥，经 RSA-OAEP-SHA256 加密置入信封。</p>
              <p>载荷通过 AES-256-GCM 高性能加密，非受信探测统一返回混淆乱文。</p>
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Ed25519 签名防篡改
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1">
              <p>服务端下发的授权有效载荷均附加 Ed25519 纯数字签名。</p>
              <p>客户端可内嵌公钥本地验签，杜绝中间人攻击与伪造返回包。</p>
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                防重放与频控保护
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1">
              <p>每次通信必须携带唯一 Nonce 随机串与毫秒级 Timestamp 时间戳。</p>
              <p>服务端配备内存滑动窗口与自动黑名单封禁策略。</p>
            </CardContent>
          </Card>
        </div>

        {/* 核心端点说明 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">核心通信端点</CardTitle>
            <CardDescription>
              客户端运行时与授权鉴权中心交互的核心接口
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="font-mono">POST</Badge>
                  <span className="font-mono text-sm font-semibold">/api/license-verification/verify</span>
                </div>
                <Badge variant="outline">授权验证与首次激活</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                用于软件启动时进行卡密鉴权。对于时长卡，首次调用将正式开启倒计时计算到期时间；对于已启用 HWID 绑定的授权，将锁定当前设备。
              </p>
              <div className="text-xs font-mono bg-muted/40 p-2.5 rounded border">
                载荷参数: &#123; licenseKey: string, softwareName: string, hwid: string, deviceName?: string, nonce: string, timestamp: number &#125;
              </div>
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="font-mono">POST</Badge>
                  <span className="font-mono text-sm font-semibold">/api/license-verification/heartbeat</span>
                </div>
                <Badge variant="outline">会话心跳与在线保活</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                客户端在运行期间按照指定的心跳间隔周期性上报，以保持会话活跃并更新最后在线状态。
              </p>
              <div className="text-xs font-mono bg-muted/40 p-2.5 rounded border">
                载荷参数: &#123; licenseKey: string, softwareName?: string, sessionId: string, hwid?: string, deviceName?: string, nonce: string, timestamp: number &#125;
              </div>
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="font-mono">POST</Badge>
                  <span className="font-mono text-sm font-semibold">/api/user/licenses/:id/unbind</span>
                </div>
                <Badge variant="outline">用户自主解除设备绑定</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                用户账号登录授权中心后，可在其权限范围内自主解绑当前卡密绑定的设备 HWID。
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 多语言客户端 SDK 代码 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Terminal className="h-5 w-5 text-primary" />
              客户端接入 SDK 代码示例
            </CardTitle>
            <CardDescription>
              选择您项目所使用的语言，一键复制完整实现代码并集成到客户端中
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="csharp" className="space-y-4">
              <TabsList className="grid w-full grid-cols-4 max-w-[480px]">
                <TabsTrigger value="csharp">C# / .NET</TabsTrigger>
                <TabsTrigger value="cpp">C / C++</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
                <TabsTrigger value="go">Golang</TabsTrigger>
              </TabsList>

              <TabsContent value="csharp" className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">推荐适用：WPF / WinForms / .NET Core 客户端</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy('csharp', csharpCode)}
                    className="gap-1.5 h-8"
                  >
                    {copiedId === 'csharp' ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedId === 'csharp' ? '已复制' : '复制代码'}
                  </Button>
                </div>
                <pre className="p-4 rounded-lg bg-zinc-950 text-zinc-100 font-mono text-xs overflow-x-auto border max-h-[460px] leading-relaxed">
                  {csharpCode}
                </pre>
              </TabsContent>

              <TabsContent value="cpp" className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">推荐适用：C++ 动态链接库 / 游戏模块 / 原生可执行程序</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy('cpp', cppCode)}
                    className="gap-1.5 h-8"
                  >
                    {copiedId === 'cpp' ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedId === 'cpp' ? '已复制' : '复制代码'}
                  </Button>
                </div>
                <pre className="p-4 rounded-lg bg-zinc-950 text-zinc-100 font-mono text-xs overflow-x-auto border max-h-[460px] leading-relaxed">
                  {cppCode}
                </pre>
              </TabsContent>

              <TabsContent value="python" className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">推荐适用：PyQt / CLI 脚本 / 自动化工具</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy('python', pythonCode)}
                    className="gap-1.5 h-8"
                  >
                    {copiedId === 'python' ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedId === 'python' ? '已复制' : '复制代码'}
                  </Button>
                </div>
                <pre className="p-4 rounded-lg bg-zinc-950 text-zinc-100 font-mono text-xs overflow-x-auto border max-h-[460px] leading-relaxed">
                  {pythonCode}
                </pre>
              </TabsContent>

              <TabsContent value="go" className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">推荐适用：跨平台二进制 / 微服务节点</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy('go', goCode)}
                    className="gap-1.5 h-8"
                  >
                    {copiedId === 'go' ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedId === 'go' ? '已复制' : '复制代码'}
                  </Button>
                </div>
                <pre className="p-4 rounded-lg bg-zinc-950 text-zinc-100 font-mono text-xs overflow-x-auto border max-h-[460px] leading-relaxed">
                  {goCode}
                </pre>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
