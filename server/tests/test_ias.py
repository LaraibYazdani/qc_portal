import base64
import json
import time

import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from jwt.algorithms import RSAAlgorithm

from app.lib.ias import IasError, verify_id_token

ISSUER, CLIENT, NONCE = "https://tenant.accounts.ondemand.com", "qc-portal-client", "nonce-123"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def jwk(private, kid):
    return {**json.loads(RSAAlgorithm.to_jwk(private.public_key())), "kid": kid, "use": "sig", "alg": "RS256"}


JWKS = {"keys": [jwk(KEY, "key-1")]}
b64 = lambda o: base64.urlsafe_b64encode(json.dumps(o).encode()).rstrip(b"=").decode()  # noqa: E731


def sign(claims, kid="key-1", key=KEY, alg="RS256"):
    h, p = b64({"alg": alg, "typ": "JWT", "kid": kid}), b64(claims)
    sig = key.sign(f"{h}.{p}".encode(), padding.PKCS1v15(), hashes.SHA256())
    return f"{h}.{p}.{base64.urlsafe_b64encode(sig).rstrip(b'=').decode()}"


NOW = int(time.time())
GOOD = {"iss": ISSUER, "aud": CLIENT, "exp": NOW + 300, "iat": NOW, "nonce": NONCE, "employee_number": "30000180"}
OPTS = {"jwks": JWKS, "issuer": ISSUER, "client_id": CLIENT, "nonce": NONCE}


def rejected(token, code):
    with pytest.raises(IasError) as e:
        verify_id_token(token, **OPTS)
    assert e.value.code == code


def test_accepts_a_correctly_signed_token():
    assert verify_id_token(sign(GOOD), **OPTS)["employee_number"] == "30000180"


def test_accepts_an_audience_list_that_includes_the_portal():
    assert verify_id_token(sign({**GOOD, "aud": ["other", CLIENT]}), **OPTS)


def test_rejects_a_token_signed_by_someone_else():
    rejected(sign(GOOD, key=OTHER), "token_validation_failed")


def test_rejects_edited_claims():
    h, _, s = sign(GOOD).split(".")
    rejected(f"{h}.{b64({**GOOD, 'employee_number': '99999999'})}.{s}", "token_validation_failed")


def test_rejects_unsigned_tokens():
    rejected(f"{b64({'alg': 'none'})}.{b64(GOOD)}.", "token_validation_failed")


@pytest.mark.parametrize("change", [{"iss": "https://evil.example.com"}, {"aud": "other-app"},
                                    {"exp": NOW - 3600}, {"nonce": "other"}])
def test_rejects_wrong_issuer_audience_expiry_or_nonce(change):
    rejected(sign({**GOOD, **change}), "token_validation_failed")


def test_rejects_malformed_tokens():
    rejected("not-a-token", "invalid_token_claims")


def test_reloads_keys_once_when_sap_rotated_them():
    calls = []

    def refetch():
        calls.append(1)
        return {"keys": [jwk(OTHER, "key-2")]}

    assert verify_id_token(sign(GOOD, kid="key-2", key=OTHER), **OPTS, refetch=refetch)
    assert len(calls) == 1
