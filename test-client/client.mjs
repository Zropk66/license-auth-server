import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export const NONCE_SIZE_V2 = 16;
export const NONCE_SIZE_VEIL = 12;
export const STAMP_SIZE = 8;
export const BINDING_SIZE = 16;
export const DEFAULT_DOMAIN = 0x01;

export function decodeLicensePayload(buffer) {
  if (!buffer || buffer.length < 16) return null;
  const issuedAt = Number(buffer.readBigUInt64LE(0));
  const expiresAt = Number(buffer.readBigUInt64LE(8));

  let customPayload = null;
  let customJson = null;
  if (buffer.length > 16) {
    customPayload = buffer.subarray(16).toString('utf8');
    try {
      customJson = JSON.parse(customPayload);
    } catch {
      customJson = null;
    }
  }

  return {
    issuedAt,
    expiresAt,
    customPayload,
    customJson,
    ...(customJson ? { dynamicData: customJson } : {}),
  };
}

export function hkdfSha256(ikm, salt, info, length) {
  const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
  const out = Buffer.alloc(length);
  let previous = Buffer.alloc(0);
  let offset = 0;
  let counter = 1;
  while (offset < length) {
    const block = crypto
      .createHmac('sha256', prk)
      .update(Buffer.concat([previous, info, Buffer.from([counter])]))
      .digest();
    const take = Math.min(block.length, length - offset);
    block.copy(out, offset, 0, take);
    offset += take;
    previous = block;
    counter += 1;
  }
  return out;
}

export function deriveMachineKey(cardKey, nonce, machineId, domain, length) {
  const info = Buffer.concat([Buffer.from(machineId, 'utf8'), Buffer.from([domain])]);
  return hkdfSha256(Buffer.from(cardKey, 'utf8'), nonce, info, length);
}

export function deriveV2KeyStream(cardKey, nonce, machineId, length) {
  const streamKey = deriveMachineKey(cardKey, nonce, machineId, 0x01, 32);
  return hkdfSha256(streamKey, nonce, Buffer.alloc(0), length);
}

export function computeV2Binding(cipher, nonce, cardKey, machineId) {
  const bindKey = deriveMachineKey(cardKey, nonce, machineId, 0x02, 32);
  const digest = crypto
    .createHmac('sha256', bindKey)
    .update(Buffer.concat([nonce, cipher]))
    .digest();
  return digest.subarray(0, BINDING_SIZE);
}

export function openV2Payload(sealed, cardKey, machineId, publicKeyPem) {
  try {
    const cipher = Buffer.from(sealed.cipherHex, 'hex');
    const signature = Buffer.from(sealed.signatureHex, 'hex');
    const nonce = Buffer.from(sealed.nonceHex, 'hex');

    if (nonce.length !== NONCE_SIZE_V2 || signature.length !== 64) {
      return null;
    }

    const binding = computeV2Binding(cipher, nonce, cardKey, machineId);
    const key = crypto.createPublicKey(publicKeyPem);
    const authentic = crypto.verify(
      null,
      Buffer.concat([nonce, binding, cipher]),
      key,
      signature
    );
    if (!authentic) return null;

    const keyStream = deriveV2KeyStream(cardKey, nonce, machineId, cipher.length);
    const plain = Buffer.alloc(cipher.length);
    for (let i = 0; i < cipher.length; i += 1) {
      plain[i] = cipher[i] ^ keyStream[i];
    }
    return decodeLicensePayload(plain);
  } catch {
    return null;
  }
}

export function createV2VerifyPayload(options, rsaPublicKeyPem) {
  const sessionKey = crypto.randomBytes(32);
  const encryptedSessionKey = crypto.publicEncrypt({
    key: rsaPublicKeyPem,
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256',
  }, sessionKey);

  const envelope = encryptedSessionKey.toString('base64');
  const iv = crypto.randomBytes(12);

  const payloadObj = {
    licenseKey: options.licenseKey,
    softwareName: options.softwareName,
    hwid: options.hwid,
    deviceName: options.deviceName || 'NodeClient',
    nonce: crypto.randomUUID().replace(/-/g, ''),
    timestamp: Date.now(),
    version: options.version,
    versionCode: options.versionCode,
  };

  const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
  const ct = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payloadObj), 'utf8')),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    v: 2,
    envelope,
    payload: `${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`,
    sessionKey,
  };
}

export function decryptV2Response(wirePayload, sessionKey, authPublicKeyPem, cardKey, hwid) {
  const parts = wirePayload.split(':');
  if (parts.length !== 3) {
    throw new Error('响应载荷格式无效');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const ct = Buffer.from(parts[2], 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, iv);
  decipher.setAuthTag(tag);
  const decryptedBuf = Buffer.concat([decipher.update(ct), decipher.final()]);
  const res = JSON.parse(decryptedBuf.toString('utf8'));

  if (res.error) {
    return { error: res.error, message: res.message || res.error };
  }

  const data = res.data || res;
  const signatureHex = res.signature;
  let signatureVerified = false;

  if (signatureHex && authPublicKeyPem) {
    try {
      signatureVerified = crypto.verify(
        null,
        Buffer.from(JSON.stringify(data), 'utf8'),
        crypto.createPublicKey(authPublicKeyPem),
        Buffer.from(signatureHex, 'hex')
      );
    } catch {
      signatureVerified = false;
    }
  }

  let unsealedPayload = null;
  if (data.payload) {
    const bindingId = hwid || cardKey;
    unsealedPayload = openV2Payload(data.payload, cardKey, bindingId, authPublicKeyPem);
  }

  return {
    data,
    signatureVerified,
    unsealedPayload,
  };
}

export function createVeilRequest(options) {
  const layoutId = options.layoutId || '1';
  const size = layoutId === '2' ? 276 : 16;
  const evidenceBuf = Buffer.alloc(size);

  return {
    licenseKey: options.licenseKey,
    softwareName: options.softwareName,
    hwid: options.hwid,
    deviceName: options.deviceName || 'NodeVeilClient',
    nonce: crypto.randomUUID().replace(/-/g, ''),
    timestamp: Date.now(),
    evidence: evidenceBuf.toString('hex'),
    evidenceLayout: layoutId,
    version: options.version,
    versionCode: options.versionCode,
  };
}

export function openVeilResponse(envelope, authPublicKeyPem, cardKey, hwid, evidence, domain = DEFAULT_DOMAIN) {
  try {
    const nonce = Buffer.from(envelope.nonceHex, 'hex');
    const ciphertext = Buffer.from(envelope.cipherHex, 'hex');
    const tag = Buffer.from(envelope.tagHex, 'hex');
    const signature = Buffer.from(envelope.signatureHex, 'hex');

    if (nonce.length !== NONCE_SIZE_VEIL || tag.length !== 16 || signature.length !== 64) {
      return null;
    }

    const stamp = Buffer.alloc(STAMP_SIZE);
    stamp.writeBigUInt64LE(BigInt(envelope.issuedAt), 0);
    const message = Buffer.concat([stamp, nonce, ciphertext, tag]);

    const key = crypto.createPublicKey(authPublicKeyPem);
    const verified = crypto.verify(null, message, key, signature);
    if (!verified) return null;

    const hwidBytes = hwid ? Buffer.from(hwid, 'utf8') : Buffer.alloc(0);
    const info = Buffer.concat([
      evidence ?? Buffer.alloc(0),
      Buffer.from([hwidBytes.length]),
      hwidBytes,
      Buffer.from([domain]),
    ]);

    const sessionKey = hkdfSha256(Buffer.from(cardKey, 'utf8'), nonce, info, 32);
    const aad = Buffer.concat([stamp, nonce, Buffer.from([domain])]);

    const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, nonce);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return decodeLicensePayload(decrypted);
  } catch {
    return null;
  }
}

export function loadConfigFile() {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const candidates = [
    path.resolve(process.cwd(), 'config.json'),
    path.resolve(process.cwd(), 'test-client/config.json'),
    path.resolve(scriptDir, 'config.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        return JSON.parse(fs.readFileSync(candidate, 'utf8'));
      } catch {
        // 忽略非合法JSON文件
      }
    }
  }
  return {};
}

export function loadEnvConfig() {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../.env'),
  ];

  let envPath = null;
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      envPath = candidate;
      break;
    }
  }

  const result = {};
  if (!envPath) return result;

  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    result[key] = val.replace(/\\n/g, '\n');
  }

  if (result.RSA_PRIVATE_KEY && !result.RSA_PUBLIC_KEY) {
    try {
      result.RSA_PUBLIC_KEY = crypto
        .createPublicKey(result.RSA_PRIVATE_KEY)
        .export({ type: 'spki', format: 'pem' })
        .toString();
    } catch {
      // 保持静默回退
    }
  }

  return result;
}

export class LicenseClient {
  constructor(options = {}) {
    const cfg = loadConfigFile();
    const env = loadEnvConfig();
    this.baseUrl = (options.url || cfg.apiUrl || 'http://localhost:3000').replace(/\/$/, '');
    this.protocol = options.protocol || 'verify';
    this.licenseKey = options.licenseKey || cfg.licenseKey;
    this.softwareName = options.softwareName || cfg.softwareName;
    this.hwid = options.hwid || cfg.hwid || 'HW-DEV-LOCAL-001';
    this.deviceName = options.deviceName || cfg.deviceName || 'LocalTestDev';
    this.version = options.version || cfg.version || '1.0.0';
    this.versionCode = options.versionCode || cfg.versionCode || 100;
    this.layoutId = options.layoutId || '1';

    this.rsaPublicKey = options.rsaPublicKey || cfg.rsaPublicKey || env.RSA_PUBLIC_KEY;
    this.authPublicKey = options.authPublicKey || cfg.publicKey || env.AUTH_PUBLIC_KEY;

    this.sessionId = null;
    this.heartbeatInterval = cfg.heartbeatIntervalSeconds || 30;
    this.heartbeatTimer = null;
    this.consecutiveFailures = 0;
    this.maxFailures = 3;
    this.isClosing = false;
    this.silent = Boolean(options.silent);

    this.unsealedPayload = null;
    this.customPayload = null;
    this.customJson = null;
    this.statusFlags = null;
  }

  log(...args) {
    if (!this.silent) {
      console.log(...args);
    }
  }

  async verify() {
    this.log(`正在连接授权服务: ${this.baseUrl}`);
    this.log(`协议类型: ${this.protocol}`);
    this.log(`卡密: ${this.licenseKey}`);
    this.log(`软件名称: ${this.softwareName}`);
    this.log(`机器识别码: ${this.hwid}`);

    if (this.protocol === 'verify') {
      if (!this.rsaPublicKey) {
        throw new Error('未配置 RSA 公钥，请在 .env 或 config.json 中提供');
      }
      const wireReq = createV2VerifyPayload({
        licenseKey: this.licenseKey,
        softwareName: this.softwareName,
        hwid: this.hwid,
        deviceName: this.deviceName,
        version: this.version,
        versionCode: this.versionCode,
      }, this.rsaPublicKey);

      let resp;
      try {
        resp = await fetch(`${this.baseUrl}/api/license-verification/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            v: wireReq.v,
            envelope: wireReq.envelope,
            payload: wireReq.payload,
          }),
        });
      } catch (netErr) {
        throw new Error(`连接服务器失败 [${this.baseUrl}]: ${netErr.message}`);
      }

      if (!resp.ok) {
        throw new Error(`HTTP 异常状态码: ${resp.status}`);
      }

      const respJson = await resp.json();
      if (!respJson.payload) {
        this.log('服务端返回原始响应:', respJson);
        return { data: respJson };
      }

      const decrypted = decryptV2Response(respJson.payload, wireReq.sessionKey, this.authPublicKey, this.licenseKey, this.hwid);
      if (decrypted.error) {
        this.log(`授权拒绝: ${decrypted.error} - ${decrypted.message}`);
        return decrypted;
      }

      this.sessionId = decrypted.data.sessionId;
      if (decrypted.data.heartbeatInterval) {
        this.heartbeatInterval = decrypted.data.heartbeatInterval;
      }

      this.log('解密成功:');
      this.log(`  用户: ${decrypted.data.username}`);
      this.log(`  状态: ${decrypted.data.status}`);
      this.log(`  过期时间: ${decrypted.data.expirationDate || 'null (permanent)'}`);
      this.log(`  会话标识: ${decrypted.data.sessionId}`);
      this.log(`  签名验证: ${decrypted.signatureVerified ? '通过' : '未通过或未提供公钥'}`);

      const returnedSoftware = decrypted.data.softwareName;
      const isUniversal = returnedSoftware === 'ALL' || returnedSoftware === '*' || returnedSoftware?.toUpperCase() === 'ALL';
      if (!isUniversal && returnedSoftware !== this.softwareName) {
        this.log(`  软件匹配警告: 服务端标识为 ${returnedSoftware}，客户端请求为 ${this.softwareName}`);
      }

      if (decrypted.unsealedPayload) {
        this.unsealedPayload = decrypted.unsealedPayload;
        this.customPayload = decrypted.unsealedPayload.customPayload || null;
        this.customJson = decrypted.unsealedPayload.customJson || null;

        this.log('  载荷解封成功:');
        this.log(`    签发时间戳: ${decrypted.unsealedPayload.issuedAt}`);
        this.log(`    到期时间戳: ${decrypted.unsealedPayload.expiresAt === 0 ? '0 (permanent)' : decrypted.unsealedPayload.expiresAt}`);
        if (this.customJson) {
          const keys = Object.keys(this.customJson);
          this.log(`    自定义载荷 JSON 对象 [共 ${keys.length} 项]:`);
          for (const key of keys) {
            const val = this.customJson[key];
            if (typeof val === 'object' && val !== null) {
              this.log(`      - ${key}:`, JSON.stringify(val));
            } else {
              this.log(`      - ${key}: ${val}`);
            }
          }
        } else if (this.customPayload) {
          this.log(`    自定义载荷: ${this.customPayload}`);
        }
      }
      return decrypted;
    }

    if (this.protocol === 'veil') {
      const veilReq = createVeilRequest({
        licenseKey: this.licenseKey,
        softwareName: this.softwareName,
        hwid: this.hwid,
        deviceName: this.deviceName,
        layoutId: this.layoutId,
        version: this.version,
        versionCode: this.versionCode,
      });

      let resp;
      try {
        resp = await fetch(`${this.baseUrl}/api/license-verification/veil`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(veilReq),
        });
      } catch (netErr) {
        throw new Error(`连接服务器失败 [${this.baseUrl}]: ${netErr.message}`);
      }

      const respJson = await resp.json();
      // 成功响应外层是 { data, signature }，失败响应仍是扁平的 { success:false, code }
      const body = respJson.data || respJson;

      if (!resp.ok || body.success !== true) {
        this.log('veil 授权拒绝:', body.message || body.code || body);
        return { data: body, error: body.error || 'veil_rejected' };
      }

      // 外层签名覆盖 success、status、expirationDate 等明文字段，
      // 验签失败说明响应被改写，不能继续采信任何内容
      if (respJson.signature && this.authPublicKey) {
        const authenticated = crypto.verify(
          null,
          Buffer.from(JSON.stringify(body), 'utf8'),
          crypto.createPublicKey(this.authPublicKey),
          Buffer.from(respJson.signature, 'hex')
        );
        if (!authenticated) {
          throw new Error('veil 响应外层签名校验失败');
        }
        this.log('  外层签名验证: 通过');
      }

      this.sessionId = body.sessionId;
      if (body.heartbeatInterval) {
        this.heartbeatInterval = body.heartbeatInterval;
      }

      this.log('veil 验证成功:');
      this.log(`  用户: ${body.username}`);
      this.log(`  状态: ${body.status}`);
      this.log(`  过期时间: ${body.expirationDate || 'null (permanent)'}`);
      this.log(`  会话标识: ${body.sessionId}`);

      const returnedSoftware = body.softwareName;
      const isUniversal = returnedSoftware === 'ALL' || returnedSoftware === '*' || returnedSoftware?.toUpperCase() === 'ALL';
      if (!isUniversal && returnedSoftware !== this.softwareName) {
        this.log(`  软件匹配警告: 服务端标识为 ${returnedSoftware}，客户端请求为 ${this.softwareName}`);
      }

      if (body.envelope && this.authPublicKey) {
        const evidenceBuf = Buffer.from(veilReq.evidence, 'hex');
        const unsealed = openVeilResponse(body.envelope, this.authPublicKey, this.licenseKey, this.hwid, evidenceBuf);
        if (unsealed) {
          this.unsealedPayload = unsealed;
          this.customPayload = unsealed.customPayload || null;
          this.customJson = unsealed.customJson || null;
          this.statusFlags = typeof unsealed.customJson?._flags === 'number'
            ? unsealed.customJson._flags
            : null;

          this.log('  veil 信封解封成功:');
          this.log(`    签发时间戳: ${unsealed.issuedAt}`);
          this.log(`    到期时间戳: ${unsealed.expiresAt === 0 ? '0 (permanent)' : unsealed.expiresAt}`);
          if (this.statusFlags !== null) {
            this.log(`    授权状态位: 0x${this.statusFlags.toString(16)}`);
          }
          if (this.customJson) {
            const keys = Object.keys(this.customJson);
            this.log(`    自定义载荷 JSON 对象 [共 ${keys.length} 项]:`);
            for (const key of keys) {
              const val = this.customJson[key];
              if (typeof val === 'object' && val !== null) {
                this.log(`      - ${key}:`, JSON.stringify(val));
              } else {
                this.log(`      - ${key}: ${val}`);
              }
            }
          } else if (this.customPayload) {
            this.log(`    自定义载荷: ${this.customPayload}`);
          }
        } else {
          this.log('  veil 信封解封失败: 证据或公钥不匹配');
        }
      }
      return { data: body, signatureVerified: true };
    }

    throw new Error(`未知协议: ${this.protocol}`);
  }

  async sendHeartbeat() {
    if (!this.sessionId) return null;
    if (!this.rsaPublicKey) {
      throw new Error('未配置 RSA 公钥，无法发起心跳');
    }

    const payloadObj = {
      licenseKey: this.licenseKey,
      hwid: this.hwid,
      sessionId: this.sessionId,
      deviceName: this.deviceName,
      softwareName: this.softwareName,
      nonce: crypto.randomUUID().replace(/-/g, ''),
      timestamp: Date.now(),
    };

    const sessionKey = crypto.randomBytes(32);
    const encryptedSessionKey = crypto.publicEncrypt({
      key: this.rsaPublicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    }, sessionKey);

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
    const ct = Buffer.concat([
      cipher.update(Buffer.from(JSON.stringify(payloadObj), 'utf8')),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    const wireBody = {
      v: 2,
      envelope: encryptedSessionKey.toString('base64'),
      payload: `${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`,
    };

    const resp = await fetch(`${this.baseUrl}/api/license-verification/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(wireBody),
    });

    if (!resp.ok) {
      throw new Error(`心跳 HTTP 状态码错误: ${resp.status}`);
    }

    const respJson = await resp.json();
    if (!respJson.payload) {
      return respJson;
    }

    const parts = respJson.payload.split(':');
    const respIv = Buffer.from(parts[0], 'hex');
    const respTag = Buffer.from(parts[1], 'hex');
    const respCt = Buffer.from(parts[2], 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, respIv);
    decipher.setAuthTag(respTag);
    const decryptedJson = JSON.parse(Buffer.concat([
      decipher.update(respCt),
      decipher.final(),
    ]).toString('utf8'));

    if (decryptedJson.error) {
      throw new Error(`心跳被拒绝: ${decryptedJson.error} - ${decryptedJson.message || ''}`);
    }

    const data = decryptedJson.data || decryptedJson;
    if (this.authPublicKey && decryptedJson.signature) {
      const valid = crypto.verify(
        null,
        Buffer.from(JSON.stringify(data), 'utf8'),
        crypto.createPublicKey(this.authPublicKey),
        Buffer.from(decryptedJson.signature, 'hex')
      );
      if (!valid) {
        throw new Error('心跳响应签名伪造');
      }
    }

    if (data.status !== 'active') {
      throw new Error(`会话已非活跃状态: ${data.status}`);
    }

    if (data.heartbeatInterval) {
      this.heartbeatInterval = data.heartbeatInterval;
    }

    this.consecutiveFailures = 0;
    return data;
  }

  scheduleNextHeartbeat(delaySec) {
    if (this.isClosing) return;
    this.stopHeartbeat();
    const intervalSec = delaySec !== undefined ? Math.max(2, delaySec) : Math.max(5, this.heartbeatInterval);
    const intervalMs = intervalSec * 1000;

    this.heartbeatTimer = setTimeout(async () => {
      if (this.isClosing) return;
      try {
        const data = await this.sendHeartbeat();
        const nowStr = new Date().toLocaleTimeString();
        console.log(`[${nowStr}] 心跳正常 [${data?.sessionId?.slice(-8) || 'active'}], 下次心跳: ${this.heartbeatInterval}s 后`);
        this.scheduleNextHeartbeat();
      } catch (err) {
        this.consecutiveFailures += 1;
        console.error(`[心跳异常 ${this.consecutiveFailures}/${this.maxFailures}]: ${err.message}`);
        if (this.consecutiveFailures >= this.maxFailures) {
          console.log('心跳连续失败达到上限，尝试静默重新激活恢复会话...');
          try {
            await this.verify();
            this.consecutiveFailures = 0;
            console.log('静默重新激活成功，恢复心跳保持');
            this.scheduleNextHeartbeat();
            return;
          } catch (reVerifyErr) {
            console.error(`重新激活失败: ${reVerifyErr.message}，授权终止`);
            this.close();
            return;
          }
        }
        this.scheduleNextHeartbeat(5);
      }
    }, intervalMs);
  }

  startHeartbeat() {
    this.stopHeartbeat();
    console.log(`启动动态心跳保持，首次周期: ${this.heartbeatInterval}s`);
    this.scheduleNextHeartbeat();
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  async checkUpdate() {
    try {
      const resp = await fetch(`${this.baseUrl}/api/software/check-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          software: this.softwareName,
          version: this.version,
          versionCode: this.versionCode,
        }),
      });

      if (!resp.ok) return null;
      const res = await resp.json();
      if (res.hasUpdate) {
        const latest = res.latestVersion || {};
        const forceNotice = latest.isForced ? ' [强制更新]' : '';
        this.log(`发现新版本: ${latest.version || '未知'}${forceNotice}`);
        if (latest.downloadUrl) {
          this.log(`下载链接: ${latest.downloadUrl}`);
        }
      } else {
        this.log('软件版本校验: 当前已是最新版本');
      }
      return res;
    } catch {
      // 容忍版本校验网络波动
      return null;
    }
  }

  async reportOffline() {
    if (!this.sessionId) return;
    try {
      await fetch(`${this.baseUrl}/api/license-verification/offline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseKey: this.licenseKey,
          hwid: this.hwid,
          sessionId: this.sessionId,
        }),
      });
      this.log('已向服务端报告下线，释放会话资源');
    } catch {
      // 离线报告失败不抛出阻塞进程退出
    }
  }

  async close() {
    this.isClosing = true;
    this.stopHeartbeat();
    await this.reportOffline();
  }

  getCustomJson() {
    return this.customJson;
  }

  getCustomPayload() {
    return this.customPayload;
  }

  getOffset(name) {
    if (!this.customJson) return null;
    if (this.customJson.offsets && typeof this.customJson.offsets === 'object') {
      return this.customJson.offsets[name] ?? null;
    }
    return this.customJson[name] ?? null;
  }

  getSig(name) {
    if (!this.customJson) return null;
    if (this.customJson.sigs && typeof this.customJson.sigs === 'object') {
      return this.customJson.sigs[name] ?? null;
    }
    return this.customJson[name] ?? null;
  }

  async run(stayAlive = true) {
    const verified = await this.verify();
    if (!verified || verified.error) {
      return verified;
    }

    await this.checkUpdate();

    if (stayAlive) {
      this.startHeartbeat();
      console.log('客户端保持运行与心跳中，按 Ctrl+C 正常下线退出...');

      const handleExit = async () => {
        console.log('\n收到退出信号，正在安全下线...');
        await this.close();
        process.exit(0);
      };

      process.once('SIGINT', handleExit);
      process.once('SIGTERM', handleExit);

      await new Promise(() => {});
    }
    return verified;
  }
}

export async function runClient(options = {}) {
  const client = new LicenseClient(options);
  if (options.stayAlive) {
    return client.run(true);
  }
  return client.verify();
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  const options = {};
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        const key = arg.slice(2, eqIdx);
        const val = arg.slice(eqIdx + 1);
        options[key] = val;
      } else {
        options[arg.slice(2)] = true;
      }
    }
  }
  return options;
}

async function interactiveMain() {
  const cliOptions = parseCliArgs();
  const cfg = loadConfigFile();

  const protocol = cliOptions.protocol;
  const licenseKey = cliOptions.key || cfg.licenseKey;
  const softwareName = cliOptions.software || cfg.softwareName;

  if (protocol && licenseKey && softwareName) {
    try {
      const client = new LicenseClient({
        protocol,
        licenseKey,
        softwareName,
        hwid: cliOptions.hwid || cfg.hwid,
        url: cliOptions.url || cfg.apiUrl,
        layoutId: cliOptions.layoutId,
      });
      await client.run(true);
    } catch (err) {
      console.error('运行错误:', err.message);
      process.exitCode = 1;
    }
    return;
  }

  const rl = readline.createInterface({ input, output });

  try {
    console.log('选择测试验证协议:');
    console.log('1. /api/license-verification/verify (v2 RSA-OAEP + AES-GCM 信封协议)');
    console.log('2. /api/license-verification/veil (veil 零基线信封协议)');

    const choice = (await rl.question('请输入序号 [1/2, 默认 1]: ')).trim() || '1';
    const chosenProtocol = choice === '2' ? 'veil' : 'verify';

    const defaultUrl = cfg.apiUrl || 'http://localhost:3000';
    const url = (await rl.question(`服务端地址 [默认 ${defaultUrl}]: `)).trim() || defaultUrl;

    const defaultKey = cfg.licenseKey || '';
    const keyPrompt = defaultKey ? `卡密 [默认 ${defaultKey}]: ` : '卡密: ';
    const key = (await rl.question(keyPrompt)).trim() || defaultKey;
    if (!key) {
      console.log('错误: 卡密不可为空');
      return;
    }

    const defaultSoftware = cfg.softwareName || '';
    const softwarePrompt = defaultSoftware ? `软件标识 [默认 ${defaultSoftware}]: ` : '软件标识: ';
    const software = (await rl.question(softwarePrompt)).trim() || defaultSoftware;
    if (!software) {
      console.log('错误: 软件标识不可为空');
      return;
    }

    const defaultHwid = cfg.hwid || 'HW-DEV-LOCAL-001';
    const hwid = (await rl.question(`机器标识 [默认 ${defaultHwid}]: `)).trim() || defaultHwid;

    rl.close();

    const client = new LicenseClient({
      protocol: chosenProtocol,
      licenseKey: key,
      softwareName: software,
      hwid,
      url,
    });
    await client.run(true);
  } catch (err) {
    console.error('运行错误:', err.message);
  } finally {
    rl.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  interactiveMain();
}
