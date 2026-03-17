"""Hybrid categorization engine for transactions.

Strategy:
1. Check user-defined keyword rules first (fast, deterministic).
2. Fall back to LLM-based categorization using merchant name + Plaid category code.
"""

from __future__ import annotations

import json
import logging
from typing import Optional

import httpx
from sqlmodel import Session, or_, select

from app.crypto import decrypt_token
from app.database import engine
from app.models import (
    Account,
    AppLLMConfig,
    CategoryRule,
    Household,
    HouseholdLLMConfig,
    HouseholdMember,
    LLMMode,
    Transaction,
)

logger = logging.getLogger(__name__)

AVAILABLE_CATEGORIES = [
    "Food & Dining",
    "Groceries",
    "Transportation",
    "Utilities",
    "Entertainment",
    "Shopping",
    "Health & Fitness",
    "Travel",
    "Education",
    "Subscriptions",
    "Income",
    "Transfer",
    "Rent & Mortgage",
    "Insurance",
    "Investments",
    "Other",
]

SYSTEM_PROMPT = """You are a personal finance categorization assistant.
Given a list of bank transactions, assign each one to the single best-fit category.

Available categories:
{categories}

Rules:
- Use ONLY the categories listed above. Do not invent new ones.
- Use the merchant name, Plaid category hint, and amount to decide.
- Negative amounts typically indicate money coming IN (income, refunds).
- Respond with valid JSON only — an array of objects with "id" and "category" keys.
  Example: [{{"id": 1, "category": "Groceries"}}, {{"id": 2, "category": "Income"}}]
- No extra text outside the JSON array."""


def categorize_by_rules(merchant_name: str, session: Session, user_id: int) -> str | None:
    """Return a category if the merchant matches any user-defined keyword rule.

    Uses word-boundary matching to avoid false positives (e.g. "net" won't
    match "internet").  Multi-word keywords still match as substrings so that
    "whole foods" matches "Whole Foods Market".
    """
    import re

    if not merchant_name:
        return None

    rules = session.exec(
        select(CategoryRule).where(CategoryRule.user_id == user_id)
    ).all()
    for rule in rules:
        flags = 0 if rule.case_sensitive else re.IGNORECASE
        pattern = r"\b" + re.escape(rule.keyword) + r"\b"
        if re.search(pattern, merchant_name, flags):
            return rule.category

    return None


def categorize_by_llm(transaction: Transaction, user_id: int) -> str | None:
    """Categorize a single transaction via LLM. Prefer batch version for efficiency."""
    results = categorize_batch_llm([transaction], user_id)
    return results.get(transaction.id)


def _get_llm_config(user_id: int) -> tuple[str, str, str]:
    """Return (base_url, api_key, model) based on household's llm_mode."""
    try:
        with Session(engine) as session:
            member = session.exec(
                select(HouseholdMember).where(HouseholdMember.user_id == user_id)
            ).first()
            if not member:
                return ("", "", "")

            household = session.get(Household, member.household_id)
            if not household:
                return ("", "", "")

            if household.llm_mode == LLMMode.MANAGED:
                app_config = session.exec(select(AppLLMConfig)).first()
                if not app_config or not app_config.enabled or not app_config.encrypted_api_key:
                    return ("", "", "")
                return (app_config.llm_base_url, decrypt_token(app_config.encrypted_api_key), app_config.llm_model)

            if household.llm_mode == LLMMode.BYOK:
                config = session.exec(
                    select(HouseholdLLMConfig).where(
                        HouseholdLLMConfig.household_id == member.household_id
                    )
                ).first()
                if not config or not config.encrypted_api_key:
                    return ("", "", "")
                return (config.llm_base_url, decrypt_token(config.encrypted_api_key), config.llm_model)

            return ("", "", "")
    except Exception:
        return ("", "", "")


_LLM_BATCH_SIZE = 25


def _categorize_chunk_llm(
    txn_list: list[dict],
    base_url: str,
    api_key: str,
    model: str,
) -> dict[int, str]:
    """Send a single chunk of transactions to the LLM and return {id: category}."""
    user_message = json.dumps(txn_list, indent=2)
    system_message = SYSTEM_PROMPT.format(
        categories="\n".join(f"- {c}" for c in AVAILABLE_CATEGORIES)
    )

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    payload = {
        "model": model,
        "temperature": 0.1,
        "messages": [
            {"role": "system", "content": system_message},
            {"role": "user", "content": user_message},
        ],
    }

    resp = httpx.post(
        f"{base_url}/chat/completions",
        headers=headers,
        json=payload,
        timeout=15.0,
    )
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]

    content = content.strip()
    if content.startswith("```"):
        parts = content.split("\n", 1)
        content = parts[1] if len(parts) > 1 else ""
    if content.endswith("```"):
        content = content.rsplit("```", 1)[0]
    content = content.strip()

    results = json.loads(content)
    valid = {c.lower() for c in AVAILABLE_CATEGORIES}
    return {
        item["id"]: item["category"]
        for item in results
        if isinstance(item, dict)
        and item.get("category", "").lower() in valid
    }


def categorize_batch_llm(transactions: list[Transaction], user_id: int) -> dict[int, str]:
    """Send transactions to the LLM in chunks of _LLM_BATCH_SIZE and return {id: category}."""
    base_url, api_key, model = _get_llm_config(user_id)
    if not api_key:
        logger.warning("LLM API key not configured — skipping LLM categorization")
        return {}

    txn_list = [
        {
            "id": t.id,
            "merchant_name": t.merchant_name or "Unknown",
            "plaid_category": t.plaid_category_code or "N/A",
            "amount": float(t.amount),
        }
        for t in transactions
    ]

    if not txn_list:
        return {}

    all_results: dict[int, str] = {}
    for i in range(0, len(txn_list), _LLM_BATCH_SIZE):
        chunk = txn_list[i : i + _LLM_BATCH_SIZE]
        try:
            chunk_results = _categorize_chunk_llm(chunk, base_url, api_key, model)
            all_results.update(chunk_results)
        except (httpx.TimeoutException, httpx.ConnectError) as exc:
            logger.warning("LLM unreachable (chunk %d–%d): %s — skipping remaining chunks", i, i + len(chunk), exc)
            break
        except Exception:
            logger.exception("LLM categorization failed for chunk %d–%d", i, i + len(chunk))

    return all_results


def categorize_single_llm(transaction: Transaction, user_id: int) -> str | None:
    """Categorize one transaction via LLM. Returns category or None on failure."""
    base_url, api_key, model = _get_llm_config(user_id)
    if not api_key:
        return None

    txn_dict = {
        "id": transaction.id,
        "merchant_name": transaction.merchant_name or "Unknown",
        "plaid_category": getattr(transaction, "plaid_category_code", None) or "N/A",
        "amount": float(transaction.amount),
    }
    try:
        results = _categorize_chunk_llm([txn_dict], base_url, api_key, model)
        return results.get(transaction.id)
    except (httpx.TimeoutException, httpx.ConnectError) as exc:
        logger.warning("LLM unreachable for txn %s: %s", transaction.id, exc)
        return None
    except Exception:
        logger.exception("LLM categorization failed for txn %s", transaction.id)
        return None


def categorize_transaction(transaction: Transaction, session: Session, user_id: int) -> str | None:
    """Run the full categorization pipeline on a single transaction."""
    category = categorize_by_rules(transaction.merchant_name or "", session, user_id)
    if category:
        return category

    return categorize_single_llm(transaction, user_id)


def auto_categorize_pending(session: Session, user_id: int) -> dict[str, int]:
    """Categorize all uncategorized transactions for a given user. Returns counts."""
    user_account_ids = session.exec(
        select(Account.id).where(Account.user_id == user_id)
    ).all()
    txns = session.exec(
        select(Transaction).where(
            Transaction.category == None,  # noqa: E711
            or_(
                Transaction.account_id.in_(user_account_ids),  # type: ignore[union-attr]
                Transaction.user_id == user_id,
            ),
        )
    ).all()

    if not txns:
        return {"total": 0, "categorized": 0, "skipped": 0}

    categorized = 0
    for txn in txns:
        cat = categorize_by_rules(txn.merchant_name or "", session, user_id)
        if not cat:
            cat = categorize_single_llm(txn, user_id)
        if cat:
            txn.category = cat
            session.add(txn)
            categorized += 1

    session.commit()

    return {
        "total": len(txns),
        "categorized": categorized,
        "skipped": len(txns) - categorized,
    }
