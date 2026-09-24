"""Genera web/src/lib/session.vectors.json con tokens firmados por itsdangerous.

One-shot, ejecutar desde la raíz del repo:

    .venv\\Scripts\\python.exe tests\\generate_session_vectors.py

El JSON es el contrato de paridad binaria entre app/auth.py (Python) y
web/src/lib/session.ts (Astro); tests/test_session_vectors.py lo valida.
"""

import base64
import hashlib
import hmac
import json
import struct
from pathlib import Path
from typing import Any

from itsdangerous import URLSafeTimedSerializer
from itsdangerous.timed import TimestampSigner

SECRET = "session-vector-secret-0123456789abcdef"
SALT = "session"
MAX_AGE = 60 * 60 * 24 * 7
ISSUED_AT = 1789000000
AUTH_USER_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479"
OUTPUT = (
    Path(__file__).resolve().parents[1] / "web" / "src" / "lib" / "session.vectors.json"
)


class FixedTimestampSigner(TimestampSigner):
    """TimestampSigner con reloj fijo para que los vectores sean deterministas."""

    fixed_timestamp = ISSUED_AT

    def get_timestamp(self) -> int:
        return self.fixed_timestamp


def dump(value: Any, *, salt: str = SALT, timestamp: int = ISSUED_AT) -> str:
    FixedTimestampSigner.fixed_timestamp = timestamp
    serializer = URLSafeTimedSerializer(SECRET, signer=FixedTimestampSigner)
    return serializer.dumps(value, salt=salt)


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def corrupt_signature(token: str) -> str:
    payload, timestamp, signature = token.split(".")
    index = len(signature) // 2
    replacement = "A" if signature[index] != "A" else "B"
    return f"{payload}.{timestamp}.{signature[:index]}{replacement}{signature[index + 1:]}"


def malformed_payload_token() -> str:
    """Firma válida sobre un payload que no es JSON (Astro debe rechazarlo)."""
    payload = b64(b"not json")
    timestamp = b64(struct.pack(">Q", ISSUED_AT).lstrip(b"\x00"))
    message = f"{payload}.{timestamp}"
    key = hashlib.sha1(f"{SALT}signer{SECRET}".encode("utf-8")).digest()
    signature = hmac.new(key, message.encode("ascii"), hashlib.sha1).digest()
    return f"{message}.{b64(signature)}"


def main() -> None:
    valid = dump(AUTH_USER_ID)
    cases = [
        {
            "name": "valid",
            "token": valid,
            "now": ISSUED_AT,
            "expect": AUTH_USER_ID,
            "authUserId": AUTH_USER_ID,
        },
        {
            "name": "expired",
            "token": dump(AUTH_USER_ID, timestamp=ISSUED_AT - 8 * 24 * 3600),
            "now": ISSUED_AT,
            "expect": None,
        },
        {
            "name": "future",
            "token": dump(AUTH_USER_ID, timestamp=ISSUED_AT + 3600),
            "now": ISSUED_AT,
            "expect": None,
        },
        {
            "name": "corrupt_signature",
            "token": corrupt_signature(valid),
            "now": ISSUED_AT,
            "expect": None,
        },
        {
            "name": "other_salt",
            "token": dump(AUTH_USER_ID, salt="other-salt"),
            "now": ISSUED_AT,
            "expect": None,
        },
        {
            "name": "non_string_payload",
            "token": dump({"sub": "x"}),
            "now": ISSUED_AT,
            "expect": None,
        },
        {
            "name": "malformed_payload",
            "token": malformed_payload_token(),
            "now": ISSUED_AT,
            "expect": None,
        },
    ]
    payload = {"secret": SECRET, "maxAgeSeconds": MAX_AGE, "cases": cases}
    OUTPUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"escrito {OUTPUT} ({len(cases)} casos)")


if __name__ == "__main__":
    main()
