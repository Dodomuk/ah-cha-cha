import logging
import asyncio
from datetime import datetime, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from app.models.database import SessionLocal
from app.services.collector import run_collection_cycle
from app.services.market_fetcher import fetch_all_markets

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


def start_scheduler() -> None:
    scheduler.add_job(
        collection_job,
        IntervalTrigger(minutes=30),
        id="news_collection",
        replace_existing=True,
        misfire_grace_time=60,
    )
    scheduler.add_job(
        market_job,
        IntervalTrigger(minutes=15),
        id="market_fetch",
        replace_existing=True,
        misfire_grace_time=60,
    )
    scheduler.start()
    logger.info("Scheduler started (news: 30min, market: 15min)")


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
