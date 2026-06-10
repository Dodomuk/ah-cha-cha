from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select
from datetime import datetime, timezone, timedelta

from app.models.database import SessionLocal
from app.models.job_market import JobTrend, JobKeyword
from app.services.job_trend_collector import get_weekly_summary, collect_weekly_job_trends

router = APIRouter(prefix="/jobs", tags=["job_trends"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/trends/weekly")
async def get_weekly_trends(db: Session = Depends(get_db)):
    """이번 주 IT 채용 트렌드 요약"""
    try:
        summary = await get_weekly_summary(db)
        return {
            "success": True,
            "data": summary,
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
        }


@router.get("/trends/history")
async def get_trends_history(weeks: int = 12, db: Session = Depends(get_db)):
    """최근 N주간 채용 트렌드 이력"""
    try:
        today = datetime.now(timezone.utc).date()
        monday = today - timedelta(days=today.weekday())

        trends_data = {}

        for week_offset in range(weeks):
            week_date = monday - timedelta(weeks=week_offset)
            trends = db.execute(
                select(JobTrend).where(JobTrend.week_date == week_date)
            ).scalars().all()

            if trends:
                trends_data[str(week_date)] = {
                    "total_postings": sum(t.posting_count for t in trends),
                    "categories": {
                        t.job_category: {
                            "count": t.posting_count,
                            "change_pct": t.change_pct,
                        }
                        for t in trends
                    },
                }

        return {
            "success": True,
            "data": trends_data,
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
        }


@router.get("/keywords/trending")
async def get_trending_keywords(limit: int = 10, db: Session = Depends(get_db)):
    """이번 주 급상승 채용 키워드"""
    try:
        today = datetime.now(timezone.utc).date()
        monday = today - timedelta(days=today.weekday())

        keywords = db.execute(
            select(JobKeyword)
            .where(JobKeyword.week_date == monday)
            .order_by(JobKeyword.rank)
            .limit(limit)
        ).scalars().all()

        return {
            "success": True,
            "data": {
                "week_date": str(monday),
                "keywords": [k.keyword for k in keywords],
            },
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
        }


@router.get("/internal/collect-weekly")
async def internal_collect_weekly(db: Session = Depends(get_db)):
    """내부용: 수동으로 채용 트렌드를 수집합니다 (개발/테스트용)"""
    try:
        result = await collect_weekly_job_trends(db)
        return {
            "success": True,
            "data": result,
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
        }
