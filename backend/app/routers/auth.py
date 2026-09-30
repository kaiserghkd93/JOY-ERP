import os, hashlib, hmac, base64, json
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.auth import User, UserRole

router = APIRouter(prefix="/auth", tags=["인증"])
security = HTTPBearer(auto_error=False)

SECRET = os.environ.get("JWT_SECRET", "joy-erp-secret-2026")
EXPIRE_HOURS = 24 * 7  # 7일


# ── 간단한 JWT (HS256) ────────────────────────────────────────────
def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def _sign(payload: dict) -> str:
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = _b64(json.dumps(payload).encode())
    sig = _b64(hmac.new(SECRET.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest())
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


# ── 비밀번호 해시 ────────────────────────────────────────────────
def _hash(pw: str) -> str:
    return hashlib.sha256((pw + SECRET).encode()).hexdigest()


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


# ── 스키마 ──────────────────────────────────────────────────────
class LoginReq(BaseModel):
    username: str
    password: str

class UserCreateReq(BaseModel):
    username: str
    password: str
    name: str
    partner_id: str | None = None
    role: UserRole = UserRole.supplier

class UserOut(BaseModel):
    id: int
    username: str
    name: str | None
    role: UserRole
    partner_id: str | None
    is_active: bool


# ── 엔드포인트 ──────────────────────────────────────────────────
@router.post("/login")
def login(body: LoginReq, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or user.password_hash != _hash(body.password):
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 틀렸습니다")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="비활성화된 계정입니다")
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

@router.patch("/users/{user_id}/password")
def change_password(user_id: int, body: LoginReq, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404)
    u.password_hash = _hash(body.password)
    db.commit()
    return {"ok": True}

@router.patch("/users/{user_id}/toggle")
def toggle_user(user_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404)
    u.is_active = not u.is_active
    db.commit()
    return {"is_active": u.is_active}

@router.delete("/users/{user_id}")
def delete_user(user_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404)
    db.delete(u); db.commit()
    return {"ok": True}
