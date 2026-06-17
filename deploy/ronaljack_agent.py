#!/usr/bin/env python3
"""
Agent chấm công dự phòng — đọc máy Ronald Jack 5000T-C (ZKTeco) rồi đẩy lượt chấm
về Horilla qua M2M token.

Chạy trên 1 máy đặt TẠI VP, cùng LAN với máy chấm công. Cron mỗi vài phút.

Cài: pip install pyzk requests
Cấu hình qua biến môi trường:
  RJ_DEVICE_IP      IP máy chấm công (LAN), vd 192.168.1.201
  RJ_DEVICE_PORT    cổng (mặc định 4370)
  RJ_DEVICE_PASS    Comm key/password của máy (số; 0 nếu không đặt)
  RJ_HORILLA_URL    https://qlns.hnhtravel.work
  RJ_M2M_TOKEN      token service account (scope attendance:write)
  RJ_STATE_FILE     file lưu mốc thời gian đã gửi (mặc định ./ronaljack_state.json)
  RJ_CLEAR_LOGS     "1" để xoá log trên máy sau khi gửi (mặc định 0 — chỉ theo mốc)

Giả định: User ID trên máy == badge_id nhân viên trong Horilla. Nếu khác, sửa
map_badge() bên dưới.

Cron ví dụ (mỗi 3 phút):
  */3 * * * * RJ_DEVICE_IP=192.168.1.201 RJ_DEVICE_PASS=0 \
    RJ_HORILLA_URL=https://qlns.hnhtravel.work RJ_M2M_TOKEN=xxx \
    /usr/bin/python3 /opt/ronaljack_agent.py >> /var/log/ronaljack_agent.log 2>&1
"""
import json
import os
import sys
from datetime import datetime, timezone, timedelta

import requests
from zk import ZK

IP = os.environ.get("RJ_DEVICE_IP", "")
PORT = int(os.environ.get("RJ_DEVICE_PORT", "4370"))
PASSWORD = int(os.environ.get("RJ_DEVICE_PASS", "0") or "0")
HORILLA_URL = os.environ.get("RJ_HORILLA_URL", "").rstrip("/")
M2M_TOKEN = os.environ.get("RJ_M2M_TOKEN", "")
STATE_FILE = os.environ.get("RJ_STATE_FILE", "ronaljack_state.json")
CLEAR_LOGS = os.environ.get("RJ_CLEAR_LOGS", "0") == "1"
VN_TZ = timezone(timedelta(hours=7))


def log(*a):
    print(datetime.now(VN_TZ).strftime("%Y-%m-%d %H:%M:%S"), *a, flush=True)


def map_badge(user_id):
    """User ID trên máy → badge_id Horilla. Mặc định trùng nhau."""
    return str(user_id).strip()


def load_last():
    try:
        with open(STATE_FILE) as f:
            return json.load(f).get("last_ts", "")
    except Exception:
        return ""


def save_last(ts_iso):
    try:
        with open(STATE_FILE, "w") as f:
            json.dump({"last_ts": ts_iso}, f)
    except Exception as e:
        log("WARN không lưu được state:", e)


def main():
    if not (IP and HORILLA_URL and M2M_TOKEN):
        log("Thiếu cấu hình RJ_DEVICE_IP / RJ_HORILLA_URL / RJ_M2M_TOKEN")
        sys.exit(1)

    zk = ZK(IP, port=PORT, password=PASSWORD, timeout=15, force_udp=False, ommit_ping=False)
    try:
        conn = zk.connect()
    except Exception as e:
        log("Không kết nối được máy:", e)
        sys.exit(2)

    try:
        sn = ""
        try:
            sn = conn.get_serialnumber() or ""
        except Exception:
            pass
        records = conn.get_attendance() or []
        last_ts = load_last()
        punches = []
        max_ts = last_ts
        for r in records:
            # r.timestamp là datetime local của máy (giờ VN)
            ts = r.timestamp
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=VN_TZ)
            ts_iso = ts.isoformat()
            if last_ts and ts_iso <= last_ts:
                continue
            punches.append({"badge_id": map_badge(r.user_id), "timestamp": ts_iso})
            if ts_iso > max_ts:
                max_ts = ts_iso

        if not punches:
            log("Không có lượt mới.")
            return

        resp = requests.post(
            f"{HORILLA_URL}/api/attendance/biometric-punch/",
            json={"device_sn": sn, "punches": punches},
            headers={"X-HNH-Service-Token": M2M_TOKEN},
            timeout=30,
        )
        if resp.status_code == 200:
            data = resp.json()
            log(f"Gửi {len(punches)} lượt → created={data.get('created')} "
                f"skipped_dup={data.get('skipped_dup')} unmatched={data.get('unmatched')}")
            save_last(max_ts)
            if CLEAR_LOGS:
                try:
                    conn.clear_attendance()
                    log("Đã xoá log trên máy.")
                except Exception as e:
                    log("WARN xoá log lỗi:", e)
        else:
            log(f"Lỗi gửi {resp.status_code}: {resp.text[:300]}")
    finally:
        try:
            conn.disconnect()
        except Exception:
            pass


if __name__ == "__main__":
    main()
