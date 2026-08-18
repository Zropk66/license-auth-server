"""License Auth Server - Python 客户端 SDK 与接入示例.

包含：
1. 机器码 HWID 获取 (uuid.getnode)
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
import threading
import time
import urllib.error
import urllib.request
import uuid
from typing import Any, Dict, Optional


class LicenseClient:
    def __init__(self, server_url: str, license_key: str, software_name: str):
        self.server_url = server_url.rstrip("/")
        self.license_key = license_key
        self.software_name = software_name
        self.hwid = self._generate_composite_hwid()
        self.device_name = self._get_device_name()
        self.session_id: Optional[str] = None
        self._stop_heartbeat = threading.Event()
        self._heartbeat_thread: Optional[threading.Thread] = None

    def _get_command_output(self, cmd: str) -> str:
        try:
            out = subprocess.check_output(cmd, shell=True, stderr=subprocess.DEVNULL, timeout=2)
            return out.decode("utf-8", errors="ignore").strip()
        except Exception:
            return ""

    def _get_device_name(self) -> str:
        """获取客户端电脑名称."""
        name = platform.node() or os.environ.get("COMPUTERNAME", "") or "Unknown"
        return name[:100]

    def _generate_composite_hwid(self) -> str:
        """HWID生成.
        """
        fingerprints = []

        if platform.system() == "Windows":
            # 1. 主板系统 UUID (SMBIOS Type 1)
            mb_uuid = self._get_command_output("wmic csproduct get uuid /value").replace("UUID=", "").strip()
            fingerprints.append(f"MB_UUID:{mb_uuid or 'UNKNOWN_MB_UUID'}")

            # 2. 主板出厂HWID (SMBIOS Type 2)
            board_sn = self._get_command_output("wmic baseboard get serialnumber /value").replace("SerialNumber=", "").strip()
            fingerprints.append(f"BOARD_SN:{board_sn or 'UNKNOWN_BOARD_SN'}")

            # 3. CPU 物理处理器 ID
            cpu_id = self._get_command_output("wmic cpu get processorid /value").replace("ProcessorId=", "").strip()
            cpu_info = f"{cpu_id or platform.processor()}_{os.cpu_count()}"
            fingerprints.append(f"CPU:{cpu_info}")

            # 4. 主物理硬盘出厂HWID (Physical NVMe/SATA Controller Serial, 非逻辑卷标)
            disk_sn = self._get_command_output("wmic diskdrive where 'Index=0' get serialnumber /value").replace("SerialNumber=", "").strip()
            if not disk_sn:
                disk_sn = self._get_command_output("wmic diskdrive get serialnumber /value").replace("SerialNumber=", "").strip().split("\n")[0]
            fingerprints.append(f"DISK_HW_SN:{disk_sn or 'UNKNOWN_DISK_SN'}")

            # 5. BIOS ROM 序列号
            bios_sn = self._get_command_output("wmic bios get serialnumber /value").replace("SerialNumber=", "").strip()
            fingerprints.append(f"BIOS_SN:{bios_sn or 'UNKNOWN_BIOS_SN'}")
        else:
            # Linux 系统
            dmi_uuid = self._get_command_output("cat /sys/class/dmi/id/product_uuid")
            board_sn = self._get_command_output("cat /sys/class/dmi/id/board_serial")
            bios_sn = self._get_command_output("cat /sys/class/dmi/id/bios_version")
            cpu_info = f"{platform.processor()}_{os.cpu_count()}"

            fingerprints.append(f"MB_UUID:{dmi_uuid or 'UNKNOWN_DMI'}")
            fingerprints.append(f"BOARD_SN:{board_sn or 'UNKNOWN_BOARD'}")
            fingerprints.append(f"CPU:{cpu_info}")
            fingerprints.append(f"BIOS_SN:{bios_sn or 'UNKNOWN_BIOS'}")

        # 汇总多HWID特征并进行 SHA-256 加密收敛
        raw_composite = ";".join(fingerprints)
        sha256_hash = hashlib.sha256(raw_composite.encode("utf-8")).hexdigest().upper()
        return f"HWID-PY-{sha256_hash[:32]}"

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
