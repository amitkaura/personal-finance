"""Personal Finance API - FastAPI application."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sqlmodel import Session

from app.database import create_db_and_tables, engine
from app.models import UserSettings
from app.routes.accounts import router as accounts_router
from app.routes.plaid import router as plaid_router
from app.routes.settings import router as settings_router
from app.routes.transactions import router as transactions_router
from app.scheduler import start_scheduler, stop_scheduler


def _seed_settings() -> None:
    """Create the default UserSettings row if it doesn't exist yet."""
    with Session(engine) as session:
        if not session.get(UserSettings, 1):
            session.add(UserSettings(id=1))
            session.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    _seed_settings()
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title="Personal Finance API",
    description="Self-hosted personal finance system with Plaid integration.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(plaid_router, prefix="/api/v1")
app.include_router(accounts_router, prefix="/api/v1")
app.include_router(transactions_router, prefix="/api/v1")
app.include_router(settings_router, prefix="/api/v1")


@app.get("/health")
def health_check():
    return {"status": "ok"}
