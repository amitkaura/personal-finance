---
description: Prevent secrets from leaking to git or the frontend
globs:
  - personal-finance/**
---

# Secrets Safety

## Never commit secrets

- `.env` is in `.gitignore` but can still be staged with `git add -A` or `git add .env`. Always check `git status` before committing.
- If `.env` is already tracked, `git rm --cached .env` to untrack it, then commit.
- Never put real credentials in `.env.example` — use empty strings or placeholder comments.

## Never return secrets to the frontend

- The `UserSettings` model contains `llm_api_key`. This field must be **omitted or masked** in API responses.
- When adding new secret fields to any model, ensure the serialization function strips them before returning.
- Pattern: return `"llm_api_key_set": bool(settings.llm_api_key)` instead of the actual key.

## Frontend API client

- All API functions must use the shared `fetcher` or `fetchVoid` helpers which check `response.ok`.
- Never use raw `fetch()` for API calls — errors get silently swallowed.
