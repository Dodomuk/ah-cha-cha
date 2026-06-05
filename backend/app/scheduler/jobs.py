import logging
import asyncio
from datetime import datetime, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from app.models.database import SessionLocal
from app.services.collector import run_collection_cycle
from app.services.stock_news_collector import collect_stock_news, summarize_stock_news_batch
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


async def stock_news_collection_job() -> None:
    """
    주식 뉴스 수집 (장 시간만)
    장 시간: 월~금 09:00~15:30 (한국시간)
    간격: 10~15분
    """
    now = datetime.now(timezone.utc)
    logger.info(f"[Scheduler] Stock news collection job started at {now.isoformat()}")
    db = SessionLocal()
    try:
        count = await collect_stock_news(db)
        logger.info(f"[Scheduler] Stock news collection done, saved {count} articles")
    except Exception as e:
        logger.error(f"[Scheduler] Stock news collection failed: {e}", exc_info=True)
    finally:
        db.close()


async def stock_news_summarize_job() -> None:
    """
    주식 뉴스 요약 (배치 처리)
    10건씩 모아서 Claude API에 전달
    """
    logger.info("[Scheduler] Stock news summarization job started")
    db = SessionLocal()
    try:
        result = await summarize_stock_news_batch(db, limit=10)
        logger.info(f"[Scheduler] Stock news summarization done: {result}")
    except Exception as e:
        logger.error(f"[Scheduler] Stock news summarization failed: {e}", exc_info=True)
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
    # 주식 뉴스 수집 비활성화 (더 나은 서비스로 개선 중)
    # scheduler.add_job(
    #     stock_news_collection_job,
    #     CronTrigger(
    #         day_of_week="mon-fri",
    #         hour="9-15",
    #         minute="*/15",  # 0, 15, 30, 45분
    #         timezone="Asia/Seoul"
    #     ),
    #     id="stock_news_collection_market_hours",
    #     replace_existing=True,
    #     misfire_grace_time=30,
    # )

    # 주식 뉴스 수집 (장 마감 후) 비활성화
    # scheduler.add_job(
    #     stock_news_collection_job,
    #     CronTrigger(
    #         day_of_week="mon-fri",
    #         hour="16-23",
    #         minute="0",
    #         timezone="Asia/Seoul"
    #     ),
    #     id="stock_news_collection_after_hours",
    #     replace_existing=True,
    #     misfire_grace_time=30,
    # )

    # 주식 뉴스 요약 (배치) 비활성화
    # scheduler.add_job(
    #     stock_news_summarize_job,
    #     CronTrigger(minute="0", timezone="Asia/Seoul"),
    #     id="stock_news_summarize",
    #     replace_existing=True,
    #     misfire_grace_time=30,
    # )

    # 기존 보안 뉴스 수집은 비활성화 (legacy 경로에서 읽기만 가능)
    # collection_job은 더 이상 실행되지 않음

    scheduler.start()
    logger.info("Scheduler started (news collection disabled — coming with better service)")


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
