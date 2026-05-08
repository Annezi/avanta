from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.security import create_access_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginBody(BaseModel):
    login: str
    password: str


class TokenResponse(BaseModel):
    token: str
    token_type: str = "bearer"


@router.post("/login", response_model=TokenResponse)
def login(body: LoginBody) -> TokenResponse:
    settings = get_settings()
    if body.login != settings.admin_login:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not verify_password(body.password, settings.admin_password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token("admin")
    return TokenResponse(token=token)
