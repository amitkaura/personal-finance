# Contributing

Thanks for your interest in contributing! This guide covers the workflow and
conventions for the project.

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL 16 (or use Docker)
- Redis 7 (or use Docker)

### Setup with Docker (recommended)

```bash
cp .env.example .env
# Fill in required values in .env (see comments in .env.example)

docker compose up -d db redis
```

### Backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

## Development Workflow

1. **Fork the repo** and clone your fork.

2. **Create a feature branch** from `main`:

   ```bash
   git checkout -b feat/my-feature
   ```

   Branch prefixes: `feat/`, `fix/`, `refactor/`, `chore/`

3. **Write tests first.** This project follows TDD:
   - Backend: `tests/test_*.py` (pytest)
   - Frontend: `frontend/tests/*.test.tsx` (Vitest + React Testing Library)

4. **Make your changes** with the minimum code needed to pass the tests.

5. **Run the full test suites** before pushing:

   ```bash
   # Backend
   source .venv/bin/activate
   python -m pytest --tb=short -q

   # Frontend
   cd frontend
   npm test
   npm run lint
   ```

6. **Push and open a PR** against `main`:

   ```bash
   git push -u origin HEAD
   ```

   Open the PR on GitHub with a clear title and description.

## Pull Request Guidelines

- Keep PRs focused — one logical change per PR.
- Include a description of what changed and why.
- Add or update tests for any new or modified behavior.
- All CI checks must pass (backend tests, frontend tests, lint, build).
- All review comments must be resolved before merge.
- The maintainer (`@amitkaura`) will review and merge.

## Code Style

- **Backend:** Follow existing patterns in `app/`. Use type hints. Models use
  SQLModel.
- **Frontend:** TypeScript, React 19, Next.js 16, Tailwind CSS 4. Use
  existing components and utilities before creating new ones.
- **No commented-out code** in PRs.
- **No hardcoded values** — use constants, enums, or config.

## Reporting Bugs

Use the [bug report template](https://github.com/amitkaura/personal-finance/issues/new?template=bug_report.md)
on GitHub Issues. Include steps to reproduce and expected vs. actual behavior.

## Requesting Features

Use the [feature request template](https://github.com/amitkaura/personal-finance/issues/new?template=feature_request.md).
Describe the problem you're trying to solve, not just the solution.

## License

By contributing, you agree that your contributions will be licensed under the
[AGPL-3.0 License](LICENSE).
