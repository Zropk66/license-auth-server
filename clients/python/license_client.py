"""License Auth Server - Python 客户端 SDK（v2 信封加密传输）.

安全栈：
1. 传输加密  RSA-OAEP-SHA256 信封包裹会话密钥 + AES-256-GCM 载荷加密
2. 响应验证  Ed25519 签名校验 + 时间戳新鲜度（±5 分钟，防重放）
3. 防重放    每请求随机 nonce + 毫秒时间戳
4. 机器码    真实硬件标识 + SHA-256，全部无效则终止（不使用随机降级）

依赖: pip install cryptography
配置: 与 test-client/config.json 同格式（apiUrl / rsaPublicKey / publicKey /
      licenseKey / softwareName），默认自动加载 ../../test-client/config.json
"""

import base64
import hashlib
import json
import os
import platform
import secrets
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from typing import Any, Dict, Optional, Tuple

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

TIMESTAMP_TOLERANCE_MS = 300_000  # ±5 分钟


class LicenseRejected(Exception):
    """服务端明确拒绝（解密成功但返回错误响应）。"""

    def __init__(self, error: str, message: str = ""):
        self.error = error
        self.message = message
        super().__init__(f"{error} ({message})" if message else error)


def _js_json(obj: Any) -> bytes:
    """与 Node JSON.stringify 字节级一致的序列化（签名验证依赖）。"""
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _mask(s: str) -> str:
    if len(s) <= 10:
        return s[:2] + "****"
    return f"{s[:6]}****{s[-4:]}"


class LicenseClient:
    # 无效硬件标识值（OEM 占位符 / 全零 / 空）
    _HWID_INVALID = {
        "", "none", "null", "default string", "to be filled by o.e.m.",
        "00000000-0000-0000-0000-000000000000", "0", "system serial number",
    }
    _MAX_HEARTBEAT_FAILURES = 3

    def __init__(self, server_url: str, license_key: str, software_name: str,
                 rsa_public_key_pem: str, ed25519_public_key_pem: str):
        self.server_url = server_url.rstrip("/")
        self.license_key = license_key
        self.software_name = software_name
        self.hwid = self._generate_hwid()
        self.device_name = self._get_device_name()
        self.session_id: Optional[str] = None
        self.heartbeat_interval = 30
        self._stop_heartbeat = threading.Event()
        self._heartbeat_thread: Optional[threading.Thread] = None
        self._heartbeat_failures = 0

        # 公钥内嵌于客户端（非秘密），必须与服务端 .env 私钥配对
        self._rsa_pub = serialization.load_pem_public_key(rsa_public_key_pem.encode("utf-8"))
        self._ed_pub = serialization.load_pem_public_key(ed25519_public_key_pem.encode("utf-8"))

    # ── 硬件标识 ──

    def _get_command_output(self, cmd: str) -> str:
        try:
            out = subprocess.check_output(cmd, shell=True, stderr=subprocess.DEVNULL, timeout=10)
            return out.decode("utf-8", errors="ignore").strip()
        except Exception:
            return ""

    def _get_device_name(self) -> str:
        name = platform.node() or os.environ.get("COMPUTERNAME", "") or "Unknown"
        return name[:100]

    def _generate_hwid(self) -> str:
        """采集真实硬件唯一标识，组合后 SHA-256 生成 HWID，全部无效则终止。"""
        fingerprints = []

        if platform.system() == "Windows":
            raw = subprocess.check_output(
                ["powershell", "-NoProfile", "-Command",
                 "$cs = Get-CimInstance Win32_ComputerSystemProduct; "
                 "$bb = Get-CimInstance Win32_BaseBoard; "
                 "$cpu = Get-CimInstance Win32_Processor; "
                 "$bios = Get-CimInstance Win32_BIOS; "
                 'Write-Output ($cs.UUID + "|" + $bb.SerialNumber + "|" + $cpu.ProcessorId + "|" + $bios.SerialNumber)'],
                stderr=subprocess.DEVNULL, timeout=10,
            ).decode("utf-8", errors="ignore").strip()

            for part in raw.split("|"):
                part = part.strip()
                if part and part.lower() not in self._HWID_INVALID:
                    fingerprints.append(part)
        else:
            for cmd in [
                "cat /sys/class/dmi/id/product_uuid",
                "cat /sys/class/dmi/id/board_serial",
                "cat /sys/class/dmi/id/bios_version",
            ]:
                val = self._get_command_output(cmd)
                if val and val.lower() not in self._HWID_INVALID:
                    fingerprints.append(val)

            cpu_info = f"{platform.processor()}_{os.cpu_count()}"
            if cpu_info and cpu_info.lower() not in self._HWID_INVALID:
                fingerprints.append(cpu_info)

        if not fingerprints:
            print("[致命错误] 无法获取任何有效硬件标识，程序终止。")
            sys.exit(1)

        raw_composite = "|".join(fingerprints)
        sha256_hash = hashlib.sha256(raw_composite.encode("utf-8")).hexdigest().upper()
        return f"HW-{sha256_hash}"

    def _generate_nonce(self) -> str:
        return secrets.token_hex(8)

    # ── v2 信封加密传输 ──

    def _post_secure(self, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """加密请求 → 服务端 → 解密响应。任何失败抛 RuntimeError。"""
        session_key = os.urandom(32)
        iv = os.urandom(12)
        ct_and_tag = AESGCM(session_key).encrypt(iv, _js_json(payload), None)
        ciphertext, tag = ct_and_tag[:-16], ct_and_tag[-16:]
        wire_payload = f"{iv.hex()}:{tag.hex()}:{ciphertext.hex()}"

        envelope = self._rsa_pub.encrypt(
            session_key,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None,
            ),
        )

        body = json.dumps({
            "v": 2,
            "envelope": base64.b64encode(envelope).decode("ascii"),
            "payload": wire_payload,
        }).encode("utf-8")

        req = urllib.request.Request(
            f"{self.server_url}{path}",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                wire = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"HTTP {e.code}") from e

        if wire.get("v") != 2 or not isinstance(wire.get("payload"), str):
            raise RuntimeError("响应不符合 v2 协议格式")

        parts = wire["payload"].split(":")
        if len(parts) != 3:
            raise RuntimeError("响应载荷格式无效")
        try:
            iv2 = bytes.fromhex(parts[0])
            tag2 = bytes.fromhex(parts[1])
            ct2 = bytes.fromhex(parts[2])
        except ValueError as e:
            raise RuntimeError("响应载荷解码失败") from e

        try:
            plaintext = AESGCM(session_key).decrypt(iv2, ct2 + tag2, None)
        except Exception as e:
            raise RuntimeError("响应解密失败（服务端密钥已轮换或数据被篡改）") from e
        return json.loads(plaintext.decode("utf-8"))

    def _verify_signed(self, res: Dict[str, Any]) -> Dict[str, Any]:
        """Ed25519 验签 + 时间戳新鲜度。服务端拒绝时抛 LicenseRejected。"""
        if "data" not in res or "signature" not in res:
            raise LicenseRejected(res.get("error", "unknown"), res.get("message", ""))

        try:
            self._ed_pub.verify(bytes.fromhex(res["signature"]), _js_json(res["data"]))
        except Exception as e:
            raise RuntimeError("Ed25519 签名验证失败（伪造响应）") from e

        ts = res["data"].get("timestamp")
        if not isinstance(ts, (int, float)) or abs(time.time() * 1000 - ts) > TIMESTAMP_TOLERANCE_MS:
            raise RuntimeError("响应时间戳超出 ±5 分钟容差（疑似重放）")
        return res["data"]

    # ── 对外接口 ──

    def verify(self) -> bool:
        """向服务端发起卡密激活与验证。"""
        payload = {
            "licenseKey": self.license_key,
            "softwareName": self.software_name,
            "hwid": self.hwid,
            "deviceName": self.device_name,
            "nonce": self._generate_nonce(),
            "timestamp": int(time.time() * 1000),
        }

        print(f"[Verify] 发起授权验证: key={_mask(self.license_key)}, "
              f"software={self.software_name}, hwid={_mask(self.hwid)}")
        try:
            data = self._verify_signed(self._post_secure("/api/license-verification/verify", payload))
        except LicenseRejected as e:
            print(f"[Verify] 被拒绝: {e}")
            return False
        except Exception as e:
            print(f"[Verify] 失败: {e}")
            return False

        if not data.get("valid"):
            print("[Verify] 授权无效")
            return False

        self.session_id = data.get("sessionId")
        self.heartbeat_interval = data.get("heartbeatInterval", 30)
        expiration = data.get("expirationDate", "")
        print(f"[Verify] 通过（Ed25519 验签 + 时间戳校验 OK）")
        print(f"  - Session: {_mask(self.session_id or '')}")
        print(f"  - 到期时间: {expiration or '永久'}")
        print(f"  - 心跳间隔: {self.heartbeat_interval}s")
        self._start_heartbeat()
        return True

    def check_update(self, current_version: str = "", version_code: str = "") -> None:
        """版本检查（同一加密通道，响应不带签名）。"""
        payload = {"software": self.software_name, "version": current_version,
                   "versionCode": version_code}
        try:
            res = self._post_secure("/api/software/check-update", payload)
        except Exception as e:
            print(f"[Update] 检查失败: {e}")
            return

        if res.get("hasUpdate"):
            latest = res.get("latestVersion") or {}
            forced = "（强制更新）" if latest.get("isForced") else ""
            print(f"[Update] 发现新版本 {latest.get('version', '?')}{forced}")
            if latest.get("downloadUrl"):
                print(f"  - 下载: {latest['downloadUrl']}")
        else:
            print("[Update] 已是最新版本")

    def _start_heartbeat(self) -> None:
        """后台心跳线程，fail-closed：连续失败 / 状态异常 / 被拒绝 → 停止授权。"""
        self._stop_heartbeat.clear()
        self._heartbeat_failures = 0

        def loop():
            while not self._stop_heartbeat.wait(timeout=self.heartbeat_interval):
                payload = {
                    "licenseKey": self.license_key,
                    "hwid": self.hwid,
                    "sessionId": self.session_id,
                    "deviceName": self.device_name,
                    "softwareName": self.software_name,
                    "nonce": self._generate_nonce(),
                    "timestamp": int(time.time() * 1000),
                }
                try:
                    data = self._verify_signed(
                        self._post_secure("/api/license-verification/heartbeat", payload))
                    self._heartbeat_failures = 0
                    if data.get("status") != "active":
                        print(f"[Heartbeat] 会话状态异常: {data.get('status')}，停止授权。")
                        self._stop_heartbeat.set()
                        break
                    print(f"[Heartbeat] OK ({_mask(self.session_id or '')})")
                except LicenseRejected as e:
                    print(f"[Heartbeat] 被拒绝: {e}，停止授权。")
                    self._stop_heartbeat.set()
                    break
                except Exception as ex:
                    self._heartbeat_failures += 1
                    print(f"[Heartbeat] 传输失败 ({self._heartbeat_failures}/"
                          f"{self._MAX_HEARTBEAT_FAILURES}): {ex}")
                    if self._heartbeat_failures >= self._MAX_HEARTBEAT_FAILURES:
                        print("[Heartbeat] 连续失败达上限，停止授权。")
                        self._stop_heartbeat.set()
                        break

        self._heartbeat_thread = threading.Thread(target=loop, daemon=True)
        self._heartbeat_thread.start()

    def close(self) -> None:
        """关闭客户端并停止心跳。"""
        self._stop_heartbeat.set()
        if self._heartbeat_thread:
            self._heartbeat_thread.join(timeout=2)


def _load_config(path: str) -> Dict[str, str]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


if __name__ == "__main__":
    # 用法: python license_client.py [config.json] [serverUrl]
    # 默认加载 ../../test-client/config.json；serverUrl 可覆盖配置（本地联调用）
    config_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(__file__), "..", "..", "test-client", "config.json")
    cfg = _load_config(config_path)

    client = LicenseClient(
        server_url=sys.argv[2] if len(sys.argv) > 2 else cfg["apiUrl"],
        license_key=cfg["licenseKey"],
        software_name=cfg["softwareName"],
        rsa_public_key_pem=cfg["rsaPublicKey"],
        ed25519_public_key_pem=cfg["publicKey"],
    )

    if client.verify():
        client.check_update("1.0.0", "100")
        print("业务逻辑运行中...")
        time.sleep(12)
        client.close()
    else:
        print("无法启动软件，授权校验未通过。")
        sys.exit(1)
