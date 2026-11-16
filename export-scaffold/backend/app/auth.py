"""Server-side Clerk JWT Verification & Tenant Membership Enforcement for FastAPI.

Verifies Bearer tokens against Clerk's JWKS endpoint, extracts the trusted
user_id, org_id, and org_role claims, and prevents cross-tenant data access.
"""

from dataclasses import dataclass
import os
from typing import Callable

from fastapi import Depends, HTTPException, Header, status
import httpx
from jose import jwt, JWTError

CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL", "")
CLERK_ISSUER = os.getenv("CLERK_ISSUER", "")
_jwks_cache: dict | None = None


@dataclass
class AuthContext:
    user_id: str
    email: str
    org_id: str | None
    org_role: str
    platform_role: str | None


async def _get_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache is not None:
        return _jwks_cache
    if not CLERK_JWKS_URL:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="CLERK_JWKS_URL is not configured",
        )
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(CLERK_JWKS_URL)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        return _jwks_cache


async def verify_clerk_token(
    authorization: str = Header(..., alias="Authorization"),
    x_clerk_org_id: str | None = Header(default=None, alias="X-Clerk-Org-Id"),
) -> AuthContext:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Bearer token")
    token = authorization.removeprefix("Bearer ").strip()

    try:
        jwks = await _get_jwks()
        unverified_header = jwt.get_unverified_header(token)
        key = next((k for k in jwks.get("keys", []) if k.get("kid") == unverified_header.get("kid")), None)
        if not key:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signing key")

        decode_kwargs = {"algorithms": ["RS256"]}
        if CLERK_ISSUER:
            decode_kwargs["issuer"] = CLERK_ISSUER

        claims = jwt.decode(token, key, **decode_kwargs)
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid Clerk token: {exc}")

    token_org_id = claims.get("org_id")
    if x_clerk_org_id and token_org_id and x_clerk_org_id != token_org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant mismatch between token organization and request header",
        )

    metadata = claims.get("metadata") or {}
    return AuthContext(
        user_id=str(claims["sub"]),
        email=str(claims.get("email", "")),
        org_id=token_org_id,
        org_role=str(claims.get("org_role", "CUSTOMER")),
        platform_role=metadata.get("platformRole"),
    )


def require_tenant_roles(*allowed_roles: str) -> Callable[[AuthContext], AuthContext]:
    def dependency(ctx: AuthContext = Depends(verify_clerk_token)) -> AuthContext:
        if ctx.platform_role == "PLATFORM_SUPER_ADMIN":
            return ctx
        if not ctx.org_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Active restaurant organization context is required",
            )
        if allowed_roles and ctx.org_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role {ctx.org_role} is not authorized for this operation",
            )
        return ctx

    return dependency


def require_platform_admin(ctx: AuthContext = Depends(verify_clerk_token)) -> AuthContext:
    if ctx.platform_role != "PLATFORM_SUPER_ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Restricted to VIRELEO platform administrators",
        )
    return ctx
