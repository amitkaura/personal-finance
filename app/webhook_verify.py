"""Plaid webhook signature verification.

Implements the verification protocol described at:
https://plaid.com/docs/api/webhooks/webhook-verification/

Steps:
1. Extract the Plaid-Verification header (a JWS compact serialization)
2. Decode the JWS header (unverified) to get the ``kid``
3. Call Plaid ``/webhook_verification_key/get`` with that ``kid``
4. Verify the JWS signature using the returned EC public key
5. Compare the ``request_body_sha256`` claim against the SHA-256 of the body
6. Reject if the token is older than 5 minutes (``iat`` claim)
"""

from __future__ import annotations

import hashlib
import logging
import time
from base64 import b64decode
from typing import Optional

import jwt
from cryptography.hazmat.primitives.asymmetric.ec import (
    EllipticCurvePublicNumbers,
    SECP256R1,
)
from plaid.model.webhook_verification_key_get_request import (
    WebhookVerificationKeyGetRequest,
)

logger = logging.getLogger(__name__)

MAX_AGE_SECONDS = 5 * 60


def _b64url_to_int(value: str) -> int:
    """Decode a base64url-encoded big-endian unsigned integer."""
    padded = value + "=" * (4 - len(value) % 4)
    raw = b64decode(padded.replace("-", "+").replace("_", "/"))
    return int.from_bytes(raw, "big")


def _jwk_to_pem(jwk: dict) -> str:
    """Convert a JWK dict with kty=EC, crv=P-256 to a PEM public key."""
    x = _b64url_to_int(jwk["x"])
    y = _b64url_to_int(jwk["y"])
    public_numbers = EllipticCurvePublicNumbers(x=x, y=y, curve=SECP256R1())
    public_key = public_numbers.public_key()
    from cryptography.hazmat.primitives.serialization import (
        Encoding,
        PublicFormat,
    )

    return public_key.public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)


def verify_plaid_webhook(
    body: bytes,
    plaid_verification_header: Optional[str],
    plaid_client,
) -> None:
    """Verify a Plaid webhook request.

    Raises ``ValueError`` if verification fails.
    """
    if not plaid_verification_header:
        raise ValueError("Missing Plaid-Verification header")

    # Decode the JWS header (unverified) to extract the kid
    try:
        unverified_header = jwt.get_unverified_header(plaid_verification_header)
    except jwt.exceptions.DecodeError as exc:
        raise ValueError(f"Malformed Plaid-Verification header: {exc}") from exc

    kid = unverified_header.get("kid")
    if not kid:
        raise ValueError("Plaid-Verification header missing kid")

    # Fetch the verification key from Plaid
    try:
        key_response = plaid_client.webhook_verification_key_get(
            WebhookVerificationKeyGetRequest(key_id=kid)
        )
    except Exception as exc:
        raise ValueError(f"Failed to fetch Plaid verification key: {exc}") from exc

    jwk = key_response.key.to_dict()
    pem_key = _jwk_to_pem(jwk)

    # Verify the JWS signature
    try:
        claims = jwt.decode(
            plaid_verification_header,
            pem_key,
            algorithms=["ES256"],
            options={"verify_exp": False, "verify_aud": False},
        )
    except jwt.exceptions.InvalidSignatureError as exc:
        raise ValueError(f"Invalid webhook signature: {exc}") from exc
    except jwt.exceptions.DecodeError as exc:
        raise ValueError(f"Failed to decode webhook token: {exc}") from exc

    # Check the token age
    iat = claims.get("iat", 0)
    if time.time() - iat > MAX_AGE_SECONDS:
        raise ValueError("Webhook token expired (older than 5 minutes)")

    # Compare request body hash
    expected_hash = claims.get("request_body_sha256")
    if not expected_hash:
        raise ValueError("Webhook token missing request_body_sha256 claim")

    actual_hash = hashlib.sha256(body).hexdigest()
    if actual_hash != expected_hash:
        raise ValueError("Webhook body hash mismatch")
