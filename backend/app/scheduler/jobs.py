import logging
import asyncio
from datetime import datetime, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from app.models.database import SessionLocal
from app.services.collector import run_collection_cycle

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


def start_scheduler() -> None:
    # 매일 06:00 ~ 24:00, 짝수 시간마다 실행 (0,2,4,...,22 → 06,08,...,22,00 → 필터링)
    # 한국 시간 6,8,10,12,14,16,18,20,22,0시 (9회)
    scheduler.add_job(
        collection_job,
        CronTrigger(hour="0,6,8,10,12,14,16,18,20,22", minute=5, timezone="Asia/Seoul"),
        id="news_collection",
        replace_existing=True,
        misfire_grace_time=300,
    )
    scheduler.start()
    logger.info("Scheduler started (runs at :05 of 0,6,8,10,12,14,16,18,20,22 KST)")


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
