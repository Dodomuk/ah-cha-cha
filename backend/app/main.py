import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from app.config import settings
from app.models.database import engine, Base
from app.api.routes import router
from app.api.market_routes import router as market_router
from app.scheduler.jobs import start_scheduler, stop_scheduler
import app.models.market  # noqa: F401 — MarketSnapshot/History 테이블 등록

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title="아차차 API",
    description="Security Intelligence, Visualized — Backend API",
    version="0.1.0",
    lifespan=lifespan,
)


@app.middleware("http")
async def add_cors_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response


@app.options("/{full_path:path}")
async def preflight(full_path: str):
    return JSONResponse({"ok": True})

app.include_router(router, prefix="/api")
app.include_router(market_router, prefix="/api")


@app.api_route("/", methods=["GET", "HEAD"])
def root():
    return {"status": "ok", "service": "Ah-Cha-Cha Breaking News API"}


@app.api_route("/health", methods=["GET", "HEAD"])
def health():
    return {"status": "ok"}
