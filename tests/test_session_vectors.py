"""Paridad de los vectores de sesión con itsdangerous (contrato con Astro).

Hermético: solo lee web/src/lib/session.vectors.json y usa itsdangerous.

Nota: los vectores se firman y verifican con un reloj fijo (``now`` de cada
caso) para que la suite sea determinista; con el reloj real, un token de
1789000000 ya estaría vencido a los 7 días.
"""

import json
from pathlib import Path
from typing import Any

import pytest
from itsdangerous import (
    BadPayload,
    BadSignature,
    SignatureExpired,
    URLSafeTimedSerializer,
)
from itsdangerous.timed import TimestampSigner

VECTORS_PATH = (
    Path(__file__).resolve().parents[1] / "web" / "src" / "lib" / "session.vectors.json"
)
VECTORS = json.loads(VECTORS_PATH.read_text(encoding="utf-8"))
SECRET = VECTORS["secret"]
MAX_AGE = VECTORS["maxAgeSeconds"]
CASES = {case["name"]: case for case in VECTORS["cases"]}


class FixedTimestampSigner(TimestampSigner):
    fixed_timestamp = 0

    def get_timestamp(self) -> int:
        return self.fixed_timestamp


def loads_at(token: str, now: int, salt: str = "session") -> Any:
    FixedTimestampSigner.fixed_timestamp = now
    serializer = URLSafeTimedSerializer(SECRET, signer=FixedTimestampSigner)
    return serializer.loads(token, salt=salt, max_age=MAX_AGE)


def test_valid_round_trips():
    case = CASES["valid"]
    assert loads_at(case["token"], case["now"]) == case["expect"]


@pytest.mark.parametrize("name", ["expired", "future"])
def test_out_of_window_raises_signature_expired(name):
    case = CASES[name]
    with pytest.raises(SignatureExpired):
        loads_at(case["token"], case["now"])


@pytest.mark.parametrize("name", ["corrupt_signature", "other_salt"])
def test_bad_signature(name):
    case = CASES[name]
    with pytest.raises(BadSignature):
        loads_at(case["token"], case["now"])


def test_malformed_payload_raises_bad_payload():
    case = CASES["malformed_payload"]
    with pytest.raises(BadPayload):
        loads_at(case["token"], case["now"])


def test_non_string_payload_loads_a_dict():
    # itsdangerous devuelve un dict; Astro lo rechaza defensivamente (no es string).
    case = CASES["non_string_payload"]
    assert loads_at(case["token"], case["now"]) == {"sub": "x"}
