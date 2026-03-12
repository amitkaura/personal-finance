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
from sqlmodel import Session, select

from app.config import get_settings
from app.models import CategoryRule, Transaction

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


def categorize_by_rules(merchant_name: str, session: Session) -> str | None:
    """Return a category if the merchant matches any user-defined keyword rule."""
    if not merchant_name:
        return None

    rules = session.exec(select(CategoryRule)).all()
    for rule in rules:
        keyword = rule.keyword if rule.case_sensitive else rule.keyword.lower()
        name = merchant_name if rule.case_sensitive else merchant_name.lower()
        if keyword in name:
            return rule.category

    return None


def categorize_by_llm(transaction: Transaction) -> str | None:
    """Categorize a single transaction via LLM. Prefer batch version for efficiency."""
    results = categorize_batch_llm([transaction])
    return results.get(transaction.id)


def categorize_batch_llm(transactions: list[Transaction]) -> dict[int, str]:
    """Send a batch of transactions to the LLM and return {id: category} mapping."""
    settings = get_settings()
    if not settings.llm_api_key:
        logger.warning("LLM_API_KEY not configured — skipping LLM categorization")
        return {}

    txn_list = []
    for t in transactions:
        txn_list.append({
            "id": t.id,
            "merchant_name": t.merchant_name or "Unknown",
            "plaid_category": t.plaid_category_code or "N/A",
            "amount": float(t.amount),
        })

    if not txn_list:
        return {}

    user_message = json.dumps(txn_list, indent=2)
    system_message = SYSTEM_PROMPT.format(categories="\n".join(f"- {c}" for c in AVAILABLE_CATEGORIES))

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.llm_api_key}",
    }
    payload = {
        "model": settings.llm_model,
        "temperature": 0.1,
        "messages": [
            {"role": "system", "content": system_message},
            {"role": "user", "content": user_message},
        ],
    }

    try:
        resp = httpx.post(
            f"{settings.llm_base_url}/chat/completions",
            headers=headers,
            json=payload,
            timeout=60.0,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]

        # Strip markdown fences if the model wraps the JSON
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1]
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
    except Exception:
        logger.exception("LLM categorization failed")
        return {}


def categorize_transaction(transaction: Transaction, session: Session) -> str | None:
    """Run the full categorization pipeline on a single transaction."""
    category = categorize_by_rules(transaction.merchant_name or "", session)
    if category:
        return category

    return categorize_by_llm(transaction)


def auto_categorize_pending(session: Session) -> dict[str, int]:
    """Batch-categorize all needs_review transactions. Returns counts."""
    txns = session.exec(
        select(Transaction).where(Transaction.needs_review == True)
    ).all()

    if not txns:
        return {"total": 0, "categorized": 0, "skipped": 0}

    # First pass: keyword rules
    rule_matched = []
    llm_candidates = []
    for txn in txns:
        cat = categorize_by_rules(txn.merchant_name or "", session)
        if cat:
            txn.category = cat
            txn.needs_review = False
            session.add(txn)
            rule_matched.append(txn)
        else:
            llm_candidates.append(txn)

    # Second pass: LLM batch
    llm_results = categorize_batch_llm(llm_candidates) if llm_candidates else {}
    llm_matched = 0
    for txn in llm_candidates:
        cat = llm_results.get(txn.id)
        if cat:
            txn.category = cat
            txn.needs_review = False
            session.add(txn)
            llm_matched += 1

    session.commit()

    return {
        "total": len(txns),
        "categorized": len(rule_matched) + llm_matched,
        "skipped": len(txns) - len(rule_matched) - llm_matched,
    }
