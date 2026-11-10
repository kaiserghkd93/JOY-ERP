"""
설비 생산카운터 수집 미들웨어 (범용)
대상: 사출기, CNC 공작기계, 방전기(EDM), 조립 자동화 장비 등

지원 프로토콜:
  modbus_rtu  — RS-232/RS-485 (사출기, 방전기, 구형 장비)
  modbus_tcp  — Ethernet (CNC PLC, 신형 조립 자동화, 방전기)
  fanuc_focas — Fanuc CNC 전용 (focas 라이브러리 필요)
  counter     — GPIO 근접센서 펄스 카운터 (오래된 현대 사출기 등)

설치:
  pip install pymodbus requests

실행:
  python machine_collector.py

설정:
  ERP_URL과 MACHINES 목록을 환경에 맞게 수정하세요.
  레지스터 주소는 Modbus Poll(무료 툴)로 먼저 확인하세요.
"""
import os
import time
import logging
import requests

# ── 전역 설정 ─────────────────────────────────────────────────────────
ERP_URL           = os.environ.get("ERP_URL", "https://joy-erp-production.up.railway.app")
POLL_INTERVAL_SEC = int(os.environ.get("POLL_INTERVAL", "60"))
MODBUS_BAUDRATE   = 9600
MODBUS_TIMEOUT    = 2

# ── 호기별 설정 ───────────────────────────────────────────────────────
# protocol_type: modbus_rtu / modbus_tcp / fanuc_focas / counter
# comm_host:
#   modbus_rtu  → "COM3" or "/dev/ttyUSB0"
#   modbus_tcp  → "192.168.1.10:502"
#   fanuc_focas → "192.168.1.20:8193"
# counter_register_addr:
#   우진세렉스: 100~200 범위 — 매뉴얼에서 확인 (예: 110)
#   동신유압:   50~150 범위 — 매뉴얼에서 확인 (예: 60)
#   현대(오래된것): RS-232 있으면 Modbus 테스트, 없으면 counter 방식
#   CNC Fanuc:  FOCAS 사용 (pmc_rdpmcrng 함수로 카운터 주소 조회)
#   방전기:     Modbus RTU or TCP — 매뉴얼 확인
#   조립자동화: PLC Modbus TCP — 담당 엔지니어에게 레지스터맵 요청
MACHINES = [
    # === 사출기 (우진세렉스) ===
    {
        "machine_id": "M01",
        "name": "1호기 (우진세렉스)",
        "protocol": "modbus_rtu",
        "comm_host": "COM3",
        "slave_id": 1,
        "register_addr": 110,   # 실측 후 수정
        "register_count": 2,    # 2=32bit
    },
    {
        "machine_id": "M02",
        "name": "2호기 (우진세렉스)",
        "protocol": "modbus_rtu",
        "comm_host": "COM4",
        "slave_id": 1,
        "register_addr": 110,
        "register_count": 2,
    },
    # === 사출기 (동신유압) ===
    {
        "machine_id": "M05",
        "name": "5호기 (동신유압)",
        "protocol": "modbus_rtu",
        "comm_host": "COM5",
        "slave_id": 1,
        "register_addr": 60,    # 실측 후 수정
        "register_count": 2,
    },
    # === 사출기 (현대, 오래된 것) ===
    # RS-232 있으면 아래처럼 Modbus RTU 먼저 시도
    {
        "machine_id": "M08",
        "name": "8호기 (현대)",
        "protocol": "modbus_rtu",
        "comm_host": "COM6",
        "slave_id": 1,
        "register_addr": 100,   # 현대 매뉴얼 확인 필요
        "register_count": 1,    # 오래된 기계는 16bit일 수 있음
    },
    # === CNC 공작기계 — Mazak (마작) ===
    # Mazak 연동 방법 (버전에 따라 선택):
    #   1. Mazak Smooth 시리즈 (신형, Ethernet 있음):
    #      → MTConnect adapter 설치 후 HTTP로 파트카운터 읽기
    #      → 또는 Mazak SmoothLink OPC-UA (별도 소프트웨어)
    #   2. 구형 Mazatrol (RS-232):
    #      → modbus_rtu로 연결 시도 OR DPRNT 매크로로 RS-232 출력
    #   3. 현실적 대안: 근접센서 1개 → PLC/카운터 → Modbus TCP
    #      (가장 확실하고 기계 버전 무관)
    # 현재: MTConnect 방식 (Smooth 시리즈)
    # {
    #     "machine_id": "CNC01",
    #     "name": "마작 CNC",
    #     "protocol": "mtconnect",          # 추후 지원 예정
    #     "comm_host": "192.168.1.50:5000", # MTConnect Agent URL
    #     "slave_id": 0,
    #     "register_addr": 0,
    #     "register_count": 1,
    # },
    # === CNC 공작기계 — 천일 (또는 타 브랜드) ===
    # 컨트롤러 확인 필요:
    #   - Fanuc 컨트롤러: fanuc_focas 프로토콜 사용
    #   - Mitsubishi 컨트롤러: Modbus TCP (192.168.x.x:502)
    #   - Siemens 컨트롤러: OPC-UA (추후 지원)
    # {
    #     "machine_id": "CNC02",
    #     "name": "천일 CNC",
    #     "protocol": "modbus_tcp",         # Mitsubishi 컨트롤러인 경우
    #     "comm_host": "192.168.1.51:502",
    #     "slave_id": 1,
    #     "register_addr": 100,
    #     "register_count": 2,
    # },
    # === 방전기 (EDM) — Modbus TCP 지원 시 ===
    # {
    #     "machine_id": "EDM01",
    #     "name": "방전기 1번",
    #     "protocol": "modbus_tcp",
    #     "comm_host": "192.168.1.30:502",
    #     "slave_id": 1,
    #     "register_addr": 100,
    #     "register_count": 2,
    # },
    # === 조립 자동화 (PLC Modbus TCP) ===
    # {
    #     "machine_id": "ASM01",
    #     "name": "조립 자동화 1번",
    #     "protocol": "modbus_tcp",
    #     "comm_host": "192.168.1.40:502",
    #     "slave_id": 1,
    #     "register_addr": 200,   # PLC 담당 엔지니어에게 레지스터맵 요청
    #     "register_count": 2,
    # },
]

# ── 로깅 ──────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("machine_collector.log", encoding="utf-8"),
    ],
)
log = logging.getLogger(__name__)


# ── 프로토콜별 카운터 읽기 ────────────────────────────────────────────

def read_modbus_rtu(comm_host: str, slave_id: int, addr: int, count: int) -> int | None:
    from pymodbus.client import ModbusSerialClient
    client = ModbusSerialClient(
        port=comm_host,
        baudrate=MODBUS_BAUDRATE,
        parity="N", stopbits=1, bytesize=8,
        timeout=MODBUS_TIMEOUT,
    )
    try:
        if not client.connect():
            log.warning(f"[RTU:{comm_host}] 연결 실패")
            return None
        result = client.read_holding_registers(address=addr, count=count, slave=slave_id)
        if result.isError():
            log.warning(f"[RTU:{comm_host}] 레지스터 오류: {result}")
            return None
        regs = result.registers
        return (regs[0] << 16) | regs[1] if count == 2 else regs[0]
    except Exception as e:
        log.error(f"[RTU:{comm_host}] 예외: {e}")
        return None
    finally:
        client.close()


def read_modbus_tcp(comm_host: str, slave_id: int, addr: int, count: int) -> int | None:
    from pymodbus.client import ModbusTcpClient
    host, port = comm_host.rsplit(":", 1) if ":" in comm_host else (comm_host, 502)
    client = ModbusTcpClient(host=host, port=int(port), timeout=MODBUS_TIMEOUT)
    try:
        if not client.connect():
            log.warning(f"[TCP:{comm_host}] 연결 실패")
            return None
        result = client.read_holding_registers(address=addr, count=count, slave=slave_id)
        if result.isError():
            log.warning(f"[TCP:{comm_host}] 레지스터 오류: {result}")
            return None
        regs = result.registers
        return (regs[0] << 16) | regs[1] if count == 2 else regs[0]
    except Exception as e:
        log.error(f"[TCP:{comm_host}] 예외: {e}")
        return None
    finally:
        client.close()


def read_fanuc_focas(comm_host: str, **kwargs) -> int | None:
    """
    Fanuc FOCAS2 로 파트 카운터 읽기.
    focas 라이브러리 설치 필요: pip install focas
    또는 Fanuc에서 Fwlib32.dll (Windows) 직접 사용
    """
    try:
        import focas  # pip install focas
        host, port = comm_host.rsplit(":", 1) if ":" in comm_host else (comm_host, 8193)
        h = focas.allclibhndl3(host, int(port), 10)
        # 파트 카운터 읽기 (PMC 주소 D0~D3 등은 기계마다 다름)
        # 기본: program 실행 카운터
        result = focas.cnc_rdprgnum(h)
        focas.freelibhndl(h)
        return result if result else None
    except ImportError:
        log.error("focas 라이브러리 없음 — pip install focas")
        return None
    except Exception as e:
        log.error(f"[FOCAS:{comm_host}] 예외: {e}")
        return None


def read_counter(machine_config: dict) -> int | None:
    protocol = machine_config["protocol"]
    host     = machine_config["comm_host"]
    slave    = machine_config["slave_id"]
    addr     = machine_config["register_addr"]
    count    = machine_config["register_count"]

    if protocol == "modbus_rtu":
        return read_modbus_rtu(host, slave, addr, count)
    elif protocol == "modbus_tcp":
        return read_modbus_tcp(host, slave, addr, count)
    elif protocol == "fanuc_focas":
        return read_fanuc_focas(host)
    else:
        log.error(f"지원하지 않는 프로토콜: {protocol}")
        return None


# ── ERP API 전송 ──────────────────────────────────────────────────────

def push_count(machine_id: str, total_count: int) -> bool:
    url = f"{ERP_URL}/mes-floor/machines/{machine_id}/shot-push"
    try:
        resp = requests.post(url, json={"machine_total_shot": total_count}, timeout=10)
        data = resp.json()
        if data.get("ok"):
            log.info(
                f"[{machine_id}] OK | 총={total_count:,} "
                f"세션={data.get('session_count')} "
                f"양품={data.get('good_qty')}"
            )
        else:
            log.info(f"[{machine_id}] 활성세션 없음 ({data.get('reason')})")
        return True
    except Exception as e:
        log.error(f"[{machine_id}] API 전송 실패: {e}")
        return False


# ── 메인 루프 ─────────────────────────────────────────────────────────

def poll_once():
    for mc in MACHINES:
        mid = mc["machine_id"]
        log.debug(f"[{mid}] 폴링 — {mc['protocol']}:{mc['comm_host']}")
        count = read_counter(mc)
        if count is None:
            log.warning(f"[{mid}] 카운터 읽기 실패 — 건너뜀")
            continue
        log.info(f"[{mid}] 현재 총 카운터: {count:,}")
        push_count(mid, count)


def main():
    active = [m for m in MACHINES]
    log.info(f"설비 수집 시작 — {len(active)}대 / 주기 {POLL_INTERVAL_SEC}초")
    log.info(f"ERP 서버: {ERP_URL}")
    while True:
        try:
            poll_once()
        except Exception as e:
            log.error(f"폴링 루프 예외: {e}")
        time.sleep(POLL_INTERVAL_SEC)


if __name__ == "__main__":
    main()
