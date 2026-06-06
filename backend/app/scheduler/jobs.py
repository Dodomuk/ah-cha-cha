import logging
import asyncio
from datetime import datetime, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from app.models.database import SessionLocal
from app.services.collector import run_collection_cycle
from app.services.market_fetcher import fetch_all_markets
from app.services.stock_fetcher import prefetch_all_movers

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="Asia/Seoul")


async def collection_job() -> None:
    now = datetime.now(timezone.utc)
    logger.info(f"[Scheduler] Collection job started at {now.isoformat()}")
    db = SessionLocal()
    try:
        count = await run_collection_cycle(db)
        logger.info(f"[Scheduler] Collection job finished, saved {count} articles")
    except Exception as e:
        logger.error(f"[Scheduler] Collection job failed: {e}", exc_info=True)
    finally:
        db.close()


async def market_job() -> None:
    now = datetime.now(timezone.utc)
    logger.info(f"[Scheduler] Market fetch job started at {now.isoformat()}")
    db = SessionLocal()
    try:
        count = fetch_all_markets(db)
        logger.info(f"[Scheduler] Market fetch done: {count} markets updated")
    except Exception as e:
        logger.error(f"[Scheduler] Market fetch failed: {e}", exc_info=True)
    finally:
        db.close()


async def movers_prefetch_job() -> None:
    """전체 무버스 프리패치 — market_job 이후 60초 뒤 실행, 이후 4시간마다."""
    logger.info("[Scheduler] Movers prefetch job started")
    db = SessionLocal()
    try:
        count = prefetch_all_movers(db)
        logger.info(f"[Scheduler] Movers prefetch done: {count} countries")
    except Exception as e:
        logger.error(f"[Scheduler] Movers prefetch failed: {e}", exc_info=True)
    finally:
        db.close()


async def legacy_news_collection_job() -> None:
    """
    기존 보안 뉴스 수집 (비활성화)
    /legacy 경로에서 히스토리 열람만 가능하도록 변경
    """
    # 새로운 서비스로 전환되어 비활성화됨
    pass


def start_scheduler() -> None:
    scheduler.start()
    logger.info("Scheduler started")


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
