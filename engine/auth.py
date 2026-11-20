"""Authentication helpers: password hashing and HMAC-signed session tokens.

Both use only the standard library so no new runtime dependency is added.
Session tokens are signed with COOKIE_SECRET and carry an expiry; they are
stateless (no sessions table), so a single uvicorn worker can verify them
without shared state.
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Optional

PBKDF2_ITERATIONS = 200_000
SESSION_TTL_SECONDS = 7 * 24 * 3600  # 7 days


def _secret() -> str:
    return os.environ.get("COOKIE_SECRET", "")


# --- Passwords -------------------------------------------------------------

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ITERATIONS)
    return "pbkdf2$%d$%s$%s" % (PBKDF2_ITERATIONS, salt, digest.hex())


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, iterations, salt, digest = stored.split("$")
        if scheme != "pbkdf2":
            return False
        candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), int(iterations))
        return hmac.compare_digest(candidate.hex(), digest)
    except (ValueError, AttributeError):
        return False


# --- Session tokens --------------------------------------------------------

def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def create_token(user_id: int, email: str, role: str, ttl: int = SESSION_TTL_SECONDS) -> str:
    payload = {"uid": user_id, "email": email, "role": role, "exp": int(time.time()) + ttl}
    body = _b64encode(json.dumps(payload, sort_keys=True).encode("utf-8"))
    sig = hmac.new(_secret().encode("utf-8"), body.encode("ascii"), hashlib.sha256).hexdigest()
    return "%s.%s" % (body, sig)


def verify_token(token: str) -> Optional[dict]:
    """Return the payload if the token is well-formed, correctly signed and
    not expired; otherwise ``None``. Never raises."""
    if not token or not _secret():
        return None
    parts = token.split(".")
    if len(parts) != 2:
        return None
    body, sig = parts
    expected = hmac.new(_secret().encode("utf-8"), body.encode("ascii"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        payload = json.loads(_b64decode(body).decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None
    if int(payload.get("exp", 0)) < int(time.time()):
        return None
    return payload
