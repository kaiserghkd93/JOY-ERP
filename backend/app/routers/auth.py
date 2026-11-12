import os, hashlib, hmac, base64, json, time
import bcrypt as _bcrypt_lib
from collections import defaultdict
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator

from app.database import get_db
from app.models.auth import User, UserRole

router = APIRouter(prefix="/auth", tags=["인증"])
security = HTTPBearer(auto_error=False)

SECRET = os.environ.get("JWT_SECRET", "")
if not SECRET:
    # JWT_SECRET 미설정 시 DATABASE_URL 해시로 재시작에도 안정적인 시크릿 유지
    _db_url = os.environ.get("DATABASE_URL", "joy-erp-local-fallback")
    SECRET = hashlib.sha256(f"joy-erp-jwt-{_db_url}".encode()).hexdigest()

EXPIRE_HOURS = 72  # 72시간(3일)

# ── rate limiter (IP별 로그인 실패 추적) ─────────────────────────
_fail_log: dict[str, list[float]] = defaultdict(list)
_WINDOW = 900   # 15분
_MAX_FAIL = 10  # 최대 실패 횟수

def _check_rate(ip: str):
    now = time.time()
    _fail_log[ip] = [t for t in _fail_log[ip] if now - t < _WINDOW]
    if len(_fail_log[ip]) >= _MAX_FAIL:
        raise HTTPException(429, f"로그인 시도 횟수 초과. {_WINDOW//60}분 후 재시도하세요.")

def _record_fail(ip: str):
    _fail_log[ip].append(time.time())

def _clear_fail(ip: str):
    _fail_log.pop(ip, None)


# ── JWT (HS256) ──────────────────────────────────────────────────
def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def _sign(payload: dict) -> str:
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body   = _b64(json.dumps(payload).encode())
    sig    = _b64(hmac.new(SECRET.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest())
    return f"{header}.{body}.{sig}"

def _verify(token: str) -> dict:
    try:
        h, b, s = token.split(".")
        expected = _b64(hmac.new(SECRET.encode(), f"{h}.{b}".encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(s, expected):
            raise ValueError
        pad = 4 - len(b) % 4
        payload = json.loads(base64.urlsafe_b64decode(b + "=" * pad))
        if payload["exp"] < datetime.utcnow().timestamp():
            raise ValueError("expired")
        return payload
    except Exception:
        raise HTTPException(status_code=401, detail="토큰이 유효하지 않습니다")


# ── 비밀번호 해시 (bcrypt) ───────────────────────────────────────
_LEGACY_SECRET = "joy-erp-secret-2026"  # SHA-256 마이그레이션용 고정값

def _hash(pw: str) -> str:
    return _bcrypt_lib.hashpw(pw.encode(), _bcrypt_lib.gensalt()).decode()

def _verify_password(plain: str, stored: str) -> bool:
    """bcrypt 또는 구형 SHA-256 모두 검증"""
    if stored.startswith("$2b$") or stored.startswith("$2a$"):
        return _bcrypt_lib.checkpw(plain.encode(), stored.encode())
    # 구형 SHA-256 폴백 — 두 가지 솔트 모두 시도
    if hmac.compare_digest(stored, hashlib.sha256((plain + _LEGACY_SECRET).encode()).hexdigest()):
        return True
    # JWT_SECRET이 솔트로 사용된 경우 (마이그레이션 과도기 버그 대응)
    return hmac.compare_digest(stored, hashlib.sha256((plain + SECRET).encode()).hexdigest())


# ── 현재 유저 가져오기 (의존성) ──────────────────────────────────
def get_current_user(
    cred: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if not cred:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다")
    payload = _verify(cred.credentials)
    user = db.get(User, payload["sub"])
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="유효하지 않은 계정입니다")
    return user

def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다")
    return user

def require_supplier(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.supplier:
        raise HTTPException(status_code=403, detail="업체 계정이 아닙니다")
    return user

def require_admin_or_accounting(user: User = Depends(get_current_user)) -> User:
    if user.role not in (UserRole.admin, UserRole.accounting):
        raise HTTPException(status_code=403, detail="관리자 또는 경리 권한이 필요합니다")
    return user


# ── 스키마 ──────────────────────────────────────────────────────
class LoginReq(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def _check_username(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) > 50:
            raise ValueError("아이디는 1~50자여야 합니다")
        return v

    @field_validator("password")
    @classmethod
    def _check_password(cls, v: str) -> str:
        if not v or len(v) > 128:
            raise ValueError("비밀번호를 확인하세요")
        return v

class UserCreateReq(BaseModel):
    username: str
    password: str
    name: str
    partner_id: str | None = None
    role: str = UserRole.supplier

    @field_validator("username")
    @classmethod
    def _uname(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2 or len(v) > 50:
            raise ValueError("아이디는 2~50자여야 합니다")
        return v

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("비밀번호는 6자 이상이어야 합니다")
        if len(v) > 128:
            raise ValueError("비밀번호가 너무 깁니다")
        return v

class UserPatchReq(BaseModel):
    name: str | None = None
    role: str | None = None
    is_active: bool | None = None
    password: str | None = None
    partner_id: str | None = None

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str | None) -> str | None:
        if v is not None and len(v) < 6:
            raise ValueError("비밀번호는 6자 이상이어야 합니다")
        return v

class UserOut(BaseModel):
    id: int
    username: str
    name: str | None
    role: str
    partner_id: str | None
    is_active: bool


# ── 엔드포인트 ──────────────────────────────────────────────────
@router.post("/login")
def login(request: Request, body: LoginReq, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "unknown"
    _check_rate(ip)

    user = db.query(User).filter(User.username == body.username).first()
    if not user or not _verify_password(body.password, user.password_hash):
        _record_fail(ip)
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 틀렸습니다")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="비활성화된 계정입니다")

    # 구형 SHA-256 해시이면 bcrypt로 자동 업그레이드
    if not (user.password_hash.startswith("$2b$") or user.password_hash.startswith("$2a$")):
        user.password_hash = _hash(body.password)
        db.commit()

    _clear_fail(ip)
    exp = datetime.utcnow() + timedelta(hours=EXPIRE_HOURS)
    token = _sign({"sub": user.id, "role": user.role, "exp": exp.timestamp()})
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role,
        "name": user.name,
        "partner_id": user.partner_id,
    }

@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return UserOut(
        id=user.id, username=user.username, name=user.name,
        role=user.role, partner_id=user.partner_id, is_active=user.is_active,
    )

@router.get("/users", response_model=list[UserOut])
def list_users(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return [UserOut(id=u.id, username=u.username, name=u.name,
                    role=u.role, partner_id=u.partner_id, is_active=u.is_active)
            for u in db.query(User).order_by(User.id).all()]

@router.post("/users", response_model=UserOut)
def create_user(body: UserCreateReq, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(400, "이미 존재하는 아이디입니다")
    u = User(username=body.username, password_hash=_hash(body.password),
             name=body.name, role=body.role, partner_id=body.partner_id)
    db.add(u); db.commit(); db.refresh(u)
    return UserOut(id=u.id, username=u.username, name=u.name,
                   role=u.role, partner_id=u.partner_id, is_active=u.is_active)

@router.patch("/users/{user_id}")
def patch_user(user_id: int, body: UserPatchReq, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404)
    if body.name is not None:
        u.name = body.name
    if body.role is not None:
        u.role = body.role
    if body.is_active is not None:
        u.is_active = body.is_active
    if body.password is not None:
        u.password_hash = _hash(body.password)
    if body.partner_id is not None:
        u.partner_id = body.partner_id or None
    db.commit()
    return UserOut(id=u.id, username=u.username, name=u.name,
                   role=u.role, partner_id=u.partner_id, is_active=u.is_active)

@router.delete("/users/{user_id}")
def delete_user(user_id: int, me: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404)
    if u.id == me.id:
        raise HTTPException(400, "본인 계정은 비활성화할 수 없습니다")
    # ERP 원칙: 계정 이력 보존 — 삭제 대신 비활성화
    u.is_active = False
    db.commit()
    return {"ok": True, "note": "계정 비활성화 (이력 보존)"}

