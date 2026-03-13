---
description: Authorization pattern for transaction endpoints in the personal-finance backend
globs:
  - personal-finance/app/routes/transactions.py
  - personal-finance/app/routes/tags.py
---

# Transaction Ownership Checks

Transactions in this app can be owned two ways:

1. **Plaid-synced** — `account_id` is set, `user_id` may be `None`
2. **Manual** — `user_id` is set, `account_id` may be `None`

Every endpoint that reads or writes a specific transaction must check BOTH paths.
The canonical pattern is:

```python
if txn.account_id:
    acct = session.get(Account, txn.account_id)
    if not acct or acct.user_id != user.id:
        raise HTTPException(status_code=404, detail="Transaction not found")
elif not txn.user_id or txn.user_id != user.id:
    raise HTTPException(status_code=404, detail="Transaction not found")
```

Key rules:
- Always guard `txn.user_id` with `not txn.user_id or` before comparing — `None != user.id` is `True` in Python, which incorrectly denies access.
- When adding a new endpoint that touches a transaction, replicate this exact pattern. Do not skip it because "the tag ownership check is enough" — transaction ownership and tag ownership are independent.
- All sibling endpoints on the same resource must have consistent auth checks (e.g., add_tag, remove_tag, and get_tags must all verify transaction ownership).
