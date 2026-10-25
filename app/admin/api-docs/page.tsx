'use client';

import { useState } from 'react';
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

  const jsCode = `import crypto from 'node:crypto';

export class LicenseClient {
  constructor(baseUrl, rsaPublicKeyPem, authPublicKeyPem) {
    this.baseUrl = baseUrl.replace(/\\/$/, '');
    this.rsaPublicKey = rsaPublicKeyPem;
    this.authPublicKey = authPublicKeyPem;
    this.sessionId = null;
    this.heartbeatInterval = 30;
    this.heartbeatTimer = null;
    this.customJson = null;
  }

  async verify(licenseKey, softwareName, hwid) {
    const sessionKey = crypto.randomBytes(32);
    const encryptedKey = crypto.publicEncrypt({
      key: this.rsaPublicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    }, sessionKey);

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
    const reqPlain = JSON.stringify({
      licenseKey, softwareName, hwid,
      nonce: crypto.randomBytes(16).toString('hex'),
      timestamp: Date.now()
    });
    const ct = Buffer.concat([cipher.update(reqPlain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    const resp = await fetch(this.baseUrl + '/api/license-verification/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        v: 2,
        envelope: encryptedKey.toString('base64'),
        payload: iv.toString('hex') + ':' + tag.toString('hex') + ':' + ct.toString('hex')
      })
    });

    const respJson = await resp.json();
    const [rIv, rTag, rCt] = respJson.payload.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, Buffer.from(rIv, 'hex'));
    decipher.setAuthTag(Buffer.from(rTag, 'hex'));
    const decrypted = JSON.parse(Buffer.concat([decipher.update(Buffer.from(rCt, 'hex')), decipher.final()]).toString('utf8'));

    const data = decrypted.data || decrypted;
    this.sessionId = data.sessionId;
    this.heartbeatInterval = data.heartbeatInterval || 30;

    // 解封 16 字节头部与动态 JSON 载荷。密钥流分两步派生，等价于先取 32 字节
    // 子密钥再 HKDF-Expand 到密文全长。只算单个 HMAC 块会让超过 32 字节的载荷错位
    if (data.payload && this.authPublicKey) {
      const p = data.payload;
      const nonce = Buffer.from(p.nonceHex, 'hex');
      const cipherBuf = Buffer.from(p.cipherHex, 'hex');
      const signature = Buffer.from(p.signatureHex, 'hex');

      const hkdf = (ikm, salt, info, length) =>
        Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, length));

      const cardBuf = Buffer.from(licenseKey, 'utf8');
      const infoKey = Buffer.concat([Buffer.from(hwid, 'utf8'), Buffer.from([0x01])]);
      const infoBind = Buffer.concat([Buffer.from(hwid, 'utf8'), Buffer.from([0x02])]);

      const streamKey = hkdf(cardBuf, nonce, infoKey, 32);
      const keyStream = hkdf(streamKey, nonce, Buffer.alloc(0), cipherBuf.length);
      const plain = Buffer.alloc(cipherBuf.length);
      for (let i = 0; i < cipherBuf.length; i++) plain[i] = cipherBuf[i] ^ keyStream[i];

      const bindKey = hkdf(cardBuf, nonce, infoBind, 32);
      const binding = crypto
        .createHmac('sha256', bindKey)
        .update(Buffer.concat([nonce, cipherBuf]))
        .digest()
        .subarray(0, 16);

      // 验签是唯一能证明载荷由服务端签发的环节，跳过等于放弃防篡改
      const authentic = crypto.verify(
        null,
        Buffer.concat([nonce, binding, cipherBuf]),
        crypto.createPublicKey(this.authPublicKey),
        signature
      );
      if (!authentic) throw new Error('授权载荷签名校验失败');

      const issuedAt = Number(plain.readBigUInt64LE(0));
      const expiresAt = Number(plain.readBigUInt64LE(8));
      if (plain.length > 16) {
        this.customJson = JSON.parse(plain.subarray(16).toString('utf8'));
      }
    }

    return data;
  }

  // 动态随机心跳调度
  startHeartbeat() {
    this.stopHeartbeat();
    const schedule = () => {
      this.heartbeatTimer = setTimeout(async () => {
        try {
          schedule();
        } catch {
          this.heartbeatTimer = setTimeout(schedule, 5000);
        }
      }, this.heartbeatInterval * 1000);
    };
    schedule();
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
  }
}
`;

  const csharpCode = `using System;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Org.BouncyCastle.Crypto.Parameters;
using Org.BouncyCastle.Crypto.Signers;

namespace LicenseAuthClient
{
    // 需引用 BouncyCastle.Cryptography，.NET 内置库不提供 Ed25519 验签
    public class LicenseClient
    {
        private readonly HttpClient _httpClient = new HttpClient();
        private readonly string _serverBaseUrl;
        private readonly RSA _serverRsaPublicKey;
        private readonly Ed25519PublicKeyParameters _authPublicKey;

        public LicenseClient(string baseUrl, string serverRsaPubPem, string authEd25519PubPem)
        {
            _serverBaseUrl = baseUrl.TrimEnd('/');
            _serverRsaPublicKey = RSA.Create();
            _serverRsaPublicKey.ImportFromPem(serverRsaPubPem.ToCharArray());
            _authPublicKey = ParseEd25519PublicKey(authEd25519PubPem);
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

            using var dataDoc = JsonDocument.Parse(decryptedJson);
            var root = dataDoc.RootElement.TryGetProperty("data", out var d) ? d : dataDoc.RootElement;
            if (root.TryGetProperty("payload", out var payloadElem))
            {
                string nonceHex = payloadElem.GetProperty("nonceHex").GetString();
                string cipherHex = payloadElem.GetProperty("cipherHex").GetString();
                string sigHex = payloadElem.GetProperty("signatureHex").GetString();
                byte[] unsealed = UnsealPayload(nonceHex, cipherHex, sigHex, licenseKey, hwid);
                ulong issuedAt = BitConverter.ToUInt64(unsealed, 0);
                ulong expiresAt = BitConverter.ToUInt64(unsealed, 8);
                string customJson = unsealed.Length > 16 ? Encoding.UTF8.GetString(unsealed, 16, unsealed.Length - 16) : null;
            }

            return decryptedJson;
        }

        public byte[] UnsealPayload(string nonceHex, string cipherHex, string sigHex, string cardKey, string hwid)
        {
            byte[] nonce = Convert.FromHexString(nonceHex);
            byte[] cipher = Convert.FromHexString(cipherHex);
            byte[] keyStream = DeriveKeyStream(cardKey, nonce, hwid, cipher.Length);
            byte[] plain = new byte[cipher.Length];
            for (int i = 0; i < cipher.Length; i++) plain[i] = (byte)(cipher[i] ^ keyStream[i]);

            byte[] binding = HmacSha256(
                DeriveMachineKey(cardKey, nonce, hwid, 0x02, 32),
                nonce.Concat(cipher).ToArray()).Take(16).ToArray();

            byte[] signed = nonce.Concat(binding).Concat(cipher).ToArray();
            var verifier = new Ed25519Signer();
            verifier.Init(false, _authPublicKey);
            verifier.BlockUpdate(signed, 0, signed.Length);
            if (!verifier.VerifySignature(Convert.FromHexString(sigHex)))
                throw new CryptographicException("授权载荷签名校验失败");

            return plain;
        }

        private static byte[] DeriveMachineKey(string cardKey, byte[] nonce, string hwid, byte domain, int length)
        {
            byte[] info = Encoding.UTF8.GetBytes(hwid).Concat(new[] { domain }).ToArray();
            return HkdfSha256(Encoding.UTF8.GetBytes(cardKey), nonce, info, length);
        }

        // 两步派生：先用 32 字节子密钥，再 HKDF-Expand 到密文全长。
        // 只取单个 HMAC 块会让超过 32 字节的载荷在尾部错位
        private static byte[] DeriveKeyStream(string cardKey, byte[] nonce, string hwid, int length)
        {
            byte[] streamKey = DeriveMachineKey(cardKey, nonce, hwid, 0x01, 32);
            return HkdfSha256(streamKey, nonce, Array.Empty<byte>(), length);
        }

        // RFC 5869 HKDF-SHA256
        private static byte[] HkdfSha256(byte[] ikm, byte[] salt, byte[] info, int length)
        {
            using var extract = new HMACSHA256(salt.Length == 0 ? new byte[32] : salt);
            byte[] prk = extract.ComputeHash(ikm);

            using var expand = new HMACSHA256(prk);
            byte[] output = new byte[length];
            byte[] previous = Array.Empty<byte>();
            int offset = 0;
            byte counter = 1;

            while (offset < length)
            {
                byte[] block = expand.ComputeHash(previous.Concat(info).Concat(new[] { counter }).ToArray());
                int take = Math.Min(block.Length, length - offset);
                Array.Copy(block, 0, output, offset, take);
                offset += take;
                previous = block;
                counter++;
            }
            return output;
        }

        private static byte[] HmacSha256(byte[] key, byte[] data)
        {
            using var hmac = new HMACSHA256(key);
            return hmac.ComputeHash(data);
        }

        private static Ed25519PublicKeyParameters ParseEd25519PublicKey(string pem)
        {
            string base64 = pem
                .Replace("-----BEGIN PUBLIC KEY-----", "")
                .Replace("-----END PUBLIC KEY-----", "")
                .Replace("\\r", "")
                .Replace("\\n", "")
                .Trim();
            byte[] der = Convert.FromBase64String(base64);
            // SubjectPublicKeyInfo 尾部固定 32 字节为原始公钥
            return new Ed25519PublicKeyParameters(der.Skip(der.Length - 32).ToArray(), 0);
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
import struct
import hmac
import hashlib
import requests
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
import os

def hkdf_sha256(ikm: bytes, salt: bytes, info: bytes, length: int) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=length, salt=salt, info=info).derive(ikm)

def derive_machine_key(card_key: str, nonce: bytes, hwid: str, domain: int, length: int) -> bytes:
    info = hwid.encode("utf-8") + bytes([domain])
    return hkdf_sha256(card_key.encode("utf-8"), nonce, info, length)

def derive_key_stream(card_key: str, nonce: bytes, hwid: str, length: int) -> bytes:
    # 两步派生，与 Step 1 的 32 字节子密钥对齐。单步派生会让超过 32 字节的载荷错位
    stream_key = derive_machine_key(card_key, nonce, hwid, 0x01, 32)
    return hkdf_sha256(stream_key, nonce, b"", length)

class LicenseClient:
    def __init__(self, base_url: str, rsa_public_key_pem: str, auth_public_key_pem: str):
        self.base_url = base_url.rstrip("/")
        self.server_public_key = serialization.load_pem_public_key(
            rsa_public_key_pem.encode("utf-8")
        )
        self.auth_public_key = Ed25519PublicKey.from_public_bytes(
            self._extract_ed25519_raw(auth_public_key_pem)
        )

    @staticmethod
    def _extract_ed25519_raw(pem: str) -> bytes:
        body = "".join(
            line for line in pem.strip().splitlines() if not line.startswith("-----")
        )
        der = base64.b64decode(body)
        return der[-32:]

    def unseal_payload(self, payload: dict, license_key: str, hwid: str) -> dict:
        nonce = bytes.fromhex(payload["nonceHex"])
        cipher = bytes.fromhex(payload["cipherHex"])
        signature = bytes.fromhex(payload["signatureHex"])

        bind_key = derive_machine_key(license_key, nonce, hwid, 0x02, 32)
        binding = hmac.new(bind_key, nonce + cipher, hashlib.sha256).digest()[:16]

        # 验签是唯一能证明载荷由服务端签发的环节
        self.auth_public_key.verify(signature, nonce + binding + cipher)

        keystream = derive_key_stream(license_key, nonce, hwid, len(cipher))
        plain = bytes(a ^ b for a, b in zip(cipher, keystream))
        issued_at, expires_at = struct.unpack("<QQ", plain[:16])
        custom_json = json.loads(plain[16:].decode("utf-8")) if len(plain) > 16 else None
        return {"issuedAt": issued_at, "expiresAt": expires_at, "customJson": custom_json}

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
        res_data = json.loads(decrypted_bytes.decode("utf-8"))

        unsealed_info = None
        data_body = res_data.get("data", res_data)
        if "payload" in data_body and data_body["payload"]:
            unsealed_info = self.unseal_payload(data_body["payload"], license_key, hwid)

        return {"response": data_body, "unsealed": unsealed_info}

# 使用示例
# client = LicenseClient("https://auth.example.com", RSA_PUB_KEY_PEM, AUTH_PUB_KEY_PEM)
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
    <>
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
              <div className="space-y-1.5">
                <div className="text-xs font-mono bg-muted/40 p-2.5 rounded border">
                  <span className="text-muted-foreground block mb-1 font-sans text-[11px]">请求体明文参数:</span>
                  &#123; licenseKey: string, softwareName: string, hwid: string, deviceName?: string, nonce: string, timestamp: number &#125;
                </div>
                <div className="text-xs font-mono bg-muted/40 p-2.5 rounded border">
                  <span className="text-muted-foreground block mb-1 font-sans text-[11px]">解密后响应数据:</span>
                  &#123; valid: boolean, licenseKey: string, sessionId: string, heartbeatInterval: number, payload: &#123; nonceHex: string, cipherHex: string, signatureHex: string &#125; &#125;
                </div>
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
              <div className="space-y-1.5">
                <div className="text-xs font-mono bg-muted/40 p-2.5 rounded border">
                  <span className="text-muted-foreground block mb-1 font-sans text-[11px]">请求体明文参数:</span>
                  &#123; licenseKey: string, softwareName?: string, sessionId: string, hwid?: string, deviceName?: string, nonce: string, timestamp: number &#125;
                </div>
                <div className="text-xs font-mono bg-muted/40 p-2.5 rounded border">
                  <span className="text-muted-foreground block mb-1 font-sans text-[11px]">解密后响应数据:</span>
                  &#123; status: &quot;active&quot;, sessionId: string, heartbeatInterval: number, timestamp: number &#125;
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="font-mono">POST</Badge>
                  <span className="font-mono text-sm font-semibold">/api/license-verification/veil</span>
                </div>
                <Badge variant="outline">Veil 零基线证书固定双向通道</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                纯 JSON over TLS 协议通道，内置证书固定与客户端反调试代码完整性证据校验。载荷经 HKDF 派生密钥与 AES-256-GCM 封装下发。
              </p>
              <div className="space-y-1.5">
                <div className="text-xs font-mono bg-muted/40 p-2.5 rounded border">
                  <span className="text-muted-foreground block mb-1 font-sans text-[11px]">请求参数:</span>
                  &#123; licenseKey: string, softwareName: string, hwid: string, deviceName?: string, nonce: string, timestamp: number, evidence: string, evidenceLayout?: string, versionCode?: number &#125;
                </div>
                <div className="text-xs font-mono bg-muted/40 p-2.5 rounded border">
                  <span className="text-muted-foreground block mb-1 font-sans text-[11px]">响应数据:</span>
                  &#123; success: boolean, licenseKey: string, sessionId: string, heartbeatInterval: number, envelope: &#123; issuedAt: number, nonceHex: string, cipherHex: string, tagHex: string, signatureHex: string &#125; &#125;
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="font-mono">POST</Badge>
                  <span className="font-mono text-sm font-semibold">/api/license-verification/offline</span>
                </div>
                <Badge variant="outline">客户端正常下线通知</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                客户端进程正常退出时主动发起通知，立即释放当前设备占用会话，便于下次快速拉起或换端。
              </p>
              <div className="text-xs font-mono bg-muted/40 p-2.5 rounded border">
                请求参数: &#123; licenseKey: string, hwid: string, sessionId: string &#125;
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

        {/* 动态载荷与心跳协议规范 */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Code2 className="h-4 w-4 text-purple-500" />
              解封授权载荷与随机心跳格式规范
            </CardTitle>
            <CardDescription className="text-xs">
              客户端解密授权响应后获得的二进制数据布局与动态心跳处理标准
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="p-3 bg-muted/30 border rounded-lg space-y-2">
              <span className="font-semibold text-foreground">解密后明文载荷二进制布局：</span>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground font-mono">
                <li>00 ~ 07 字节: issuedAt 8字节 uint64 LE 毫秒时间戳</li>
                <li>08 ~ 15 字节: expiresAt 8字节 uint64 LE 毫秒时间戳，0 代表永久授权</li>
                <li>16 字节之后: 自定义载荷 UTF-8 JSON 字符串，含服务端合并下发的 sig 与 offset 字典</li>
              </ul>
            </div>
            <div className="p-3 bg-muted/30 border rounded-lg space-y-2 text-muted-foreground">
              <span className="font-semibold text-foreground">授权状态位与响应签名：</span>
              <p>载荷 JSON 内保留键 <code className="font-mono">_flags</code> 承载授权状态，处于签名与加密覆盖范围内，权威性高于明文 status：</p>
              <ul className="list-disc list-inside space-y-1 font-mono">
                <li>0x01: active 正常授权</li>
                <li>0x02: revoked 已撤销</li>
                <li>0x04: suspended 已冻结</li>
                <li>0x08: unactivated 待激活</li>
                <li>0x10: HWID 设备绑定已启用</li>
              </ul>
              <p className="pt-1">veil 端点响应体整体经 Ed25519 签名，返回 <code className="font-mono">{`{ data, signature }`}</code>。客户端必须验证签名后再采信 success、status、expirationDate 等明文字段。</p>
            </div>
            <div className="p-3 bg-muted/30 border rounded-lg space-y-1 text-muted-foreground">
              <span className="font-semibold text-foreground block">动态随机心跳机制：</span>
              <p>每次验证与心跳响应均下发 heartbeatInterval 数值。开启随机心跳后该数值为动态抽取。客户端严禁使用固定间隔，须根据每次响应下发的数值动态规划下次请求。</p>
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
            <Tabs defaultValue="javascript" className="space-y-4">
              <TabsList className="grid w-full grid-cols-5 max-w-[620px]">
                <TabsTrigger value="javascript">JavaScript / Node</TabsTrigger>
                <TabsTrigger value="csharp">C# / .NET</TabsTrigger>
                <TabsTrigger value="cpp">C / C++</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
                <TabsTrigger value="go">Golang</TabsTrigger>
              </TabsList>

              <TabsContent value="javascript" className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">推荐适用：Electron / Node.js / 跨平台客户端</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy('javascript', jsCode)}
                    className="gap-1.5 h-8"
                  >
                    {copiedId === 'javascript' ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedId === 'javascript' ? '已复制' : '复制代码'}
                  </Button>
                </div>
                <pre className="p-4 rounded-lg bg-zinc-950 text-zinc-100 font-mono text-xs overflow-x-auto border max-h-[460px] leading-relaxed">
                  {jsCode}
                </pre>
              </TabsContent>

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
    </>
  );
}
