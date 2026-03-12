"""Encryption utilities for sensitive data (e.g., Plaid access tokens)."""

import base64
import os
from typing import Optional

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


def _get_fernet(key: str) -> Fernet:
    """Derive a Fernet key from the provided encryption key string."""
    if not key or len(key) < 32:
        # Fallback for development - generate a deterministic key from a short secret
        key = key or "dev-secret-change-in-production"
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b"personal-finance-salt",
            iterations=100000,
        )
        derived = base64.urlsafe_b64encode(kdf.derive(key.encode()))
        return Fernet(derived)
    # Assume key is base64-encoded 32-byte key
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_access_token(plain_token: str, encryption_key: str) -> str:
    """Encrypt a Plaid access token for storage."""
    fernet = _get_fernet(encryption_key)
    return fernet.encrypt(plain_token.encode()).decode()


def decrypt_access_token(encrypted_token: str, encryption_key: str) -> str:
    """Decrypt a stored Plaid access token."""
    fernet = _get_fernet(encryption_key)
    return fernet.decrypt(encrypted_token.encode()).decode()


def generate_encryption_key() -> str:
    """Generate a new Fernet-compatible encryption key (for setup)."""
    return Fernet.generate_key().decode()
