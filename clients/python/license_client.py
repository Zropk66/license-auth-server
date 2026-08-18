"""License Auth Server - Python 客户端 SDK 与接入示例.

包含：
1. 机器码 HWID 获取 (真实硬件标识 + SHA-256)
2. Nonce 随机数与毫秒时间戳生成
3. /api/license-verification/verify 授权验证
4. /api/license-verification/heartbeat 后台守护心跳线程
"""

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
from typing import Any, Dict, Optional


class LicenseClient:
    # 无效硬件标识值（OEM 占位符 / 全零 / 空）
    _HWID_INVALID = {
        "", "none", "null", "default string", "to be filled by o.e.m.",
        "00000000-0000-0000-0000-000000000000", "0", "system serial number",
    }

    def __init__(self, server_url: str, license_key: str, software_name: str):
        self.server_url = server_url.rstrip("/")
        self.license_key = license_key
        self.software_name = software_name
        self.hwid = self._generate_hwid()
        self.device_name = self._get_device_name()
        self.session_id: Optional[str] = None
        self._stop_heartbeat = threading.Event()
        self._heartbeat_thread: Optional[threading.Thread] = None

    def _get_command_output(self, cmd: str) -> str:
        try:
            out = subprocess.check_output(cmd, shell=True, stderr=subprocess.DEVNULL, timeout=10)
            return out.decode("utf-8", errors="ignore").strip()
        except Exception:
            return ""

    def _get_device_name(self) -> str:
        """获取客户端电脑名称."""
        name = platform.node() or os.environ.get("COMPUTERNAME", "") or "Unknown"
        return name[:100]

    def _generate_hwid(self) -> str:
        """采集真实硬件唯一标识，组合后 SHA-256 生成 HWID。

        选取原则：用户不易更换 + 具备唯一性
          - 主板 UUID (SMBIOS UUID)        — 主板级唯一，更换主板才会变
          - 主板序列号 (BaseBoard Serial)   — 主板出厂序列号
          - CPU ID (ProcessorId)           — 处理器唯一标识
          - BIOS 序列号                     — 固件级标识
        获取失败时直接报错退出，不使用任何随机降级
        """
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
            print("请检查系统是否支持 WMI/CIM 查询（Win32_ComputerSystemProduct / Win32_BaseBoard / Win32_Processor / Win32_BIOS）")
            sys.exit(1)

        raw_composite = "|".join(fingerprints)
        sha256_hash = hashlib.sha256(raw_composite.encode("utf-8")).hexdigest().upper()
        return f"HW-{sha256_hash}"

    def _generate_nonce(self) -> str:
        """生成随机 Nonce 防重放."""
        return secrets.token_hex(8)

    def _post_json(self, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.server_url}{path}"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            raise RuntimeError(f"HTTP {e.code}: {error_body}") from e

    def verify(self) -> bool:
        """向服务端发起卡密激活与验证."""
        nonce = self._generate_nonce()
        timestamp = int(time.time() * 1000)

        payload = {
            "licenseKey": self.license_key,
            "softwareName": self.software_name,
            "hwid": self.hwid,
            "deviceName": self.device_name,
            "nonce": nonce,
            "timestamp": timestamp,
        }

        print(f"[Client] 发起授权验证: key={self.license_key}, software={self.software_name}, hwid={self.hwid}")
        try:
            res = self._post_json("/api/license-verification/verify", payload)
            if "data" in res and "sessionId" in res["data"]:
                self.session_id = res["data"]["sessionId"]
                interval = res["data"].get("heartbeatInterval", 30)
                print(f"[Client] 验证成功！Session: {self.session_id}")
                self._start_heartbeat(interval)
                return True
            return False
        except Exception as e:
            print(f"[Error] 授权验证失败: {e}")
            return False

    def _start_heartbeat(self, interval: int) -> None:
        """启动后台守护心跳线程."""
        self._stop_heartbeat.clear()

        def loop():
            while not self._stop_heartbeat.wait(timeout=interval):
                try:
                    payload = {
                        "licenseKey": self.license_key,
                        "softwareName": self.software_name,
                        "hwid": self.hwid,
                        "sessionId": self.session_id,
                        "deviceName": self.device_name,
                        "nonce": self._generate_nonce(),
                        "timestamp": int(time.time() * 1000),
                    }
                    self._post_json("/api/license-verification/heartbeat", payload)
                    print(f"[Heartbeat] 心跳维持成功 (Session: {self.session_id})")
                except Exception as ex:
                    print(f"[Warning] 心跳异常: {ex}")

        self._heartbeat_thread = threading.Thread(target=loop, daemon=True)
        self._heartbeat_thread.start()

    def close(self) -> None:
        """关闭客户端并停止心跳."""
        self._stop_heartbeat.set()
        if self._heartbeat_thread:
            self._heartbeat_thread.join(timeout=2)


if __name__ == "__main__":
    client = LicenseClient("http://localhost:3000", "TEST-KEY-1234", "MyPythonApp")
    if client.verify():
        print("业务逻辑运行中...")
        time.sleep(5)
        client.close()
    else:
        print("无法启动软件，授权校验未通过。")
