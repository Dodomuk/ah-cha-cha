import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.models.job_market import JobTrend, JobKeyword, JobSourceCache

logger = logging.getLogger(__name__)

JOB_CATEGORIES = {
    "ai_ml": "AI/ML",
    "frontend": "프론트엔드",
    "backend": "백엔드",
    "devops": "DevOps",
    "security": "보안",
}

KEYWORDS = {
    "ai_ml": ["LLM", "RAG", "GPT", "Transformer", "PyTorch"],
    "frontend": ["React", "TypeScript", "Next.js", "Vue", "Svelte"],
    "backend": ["FastAPI", "Django", "Go", "Rust", "Node.js"],
    "devops": ["Kubernetes", "Docker", "Terraform", "AWS", "GCP"],
    "security": ["Pentesting", "SIEM", "Zero Trust", "WAF", "Encryption"],
}


async def fetch_saramin_jobs(category: str) -> dict:
    """사람인 API에서 채용 공고 수집 (현재는 더미 구현)"""
    # TODO: 실제 사람인 API 연동 (승인 신청 필요)
    # 더미 데이터: 카테고리별 공고 수 (실제로는 API에서 조회)
    dummy_counts = {
        "ai_ml": 450,
        "frontend": 320,
        "backend": 580,
        "devops": 180,
        "security": 140,
    }
    return {"source": "saramin", "category": category, "count": dummy_counts.get(category, 0)}


async def fetch_wanted_jobs(category: str) -> dict:
    """원티드 API에서 채용 공고 수집 (현재는 더미 구현)"""
    # TODO: 실제 원티드 OpenAPI 연동
    # 더미 데이터: 카테고리별 공고 수
    dummy_counts = {
        "ai_ml": 380,
        "frontend": 290,
        "backend": 520,
        "devops": 160,
        "security": 120,
    }
    return {"source": "wanted", "category": category, "count": dummy_counts.get(category, 0)}


async def collect_weekly_job_trends(db: Session) -> dict:
    """매주 월요일에 실행: 직군별 공고 수 수집 및 증감률 계산"""
    logger.info("[Job Trends] Weekly collection started")

    week_date = datetime.now(timezone.utc).date()
    # 월요일로 맞추기
    monday = week_date - timedelta(days=week_date.weekday())

    results = {
        "week_date": str(monday),
        "categories_collected": 0,
        "keywords_collected": 0,
    }

    try:
        for category in JOB_CATEGORIES.keys():
            # 사람인 + 원티드에서 데이터 수집
            saramin_result = await fetch_saramin_jobs(category)
            wanted_result = await fetch_wanted_jobs(category)

            # 총합 계산
            total_count = saramin_result["count"] + wanted_result["count"]

            # 지난주 데이터 조회
            prev_week_date = monday - timedelta(days=7)
            prev_trend = db.execute(
                select(JobTrend).where(
                    JobTrend.week_date == prev_week_date,
                    JobTrend.job_category == category,
                )
            ).scalar_one_or_none()

            prev_count = prev_trend.posting_count if prev_trend else None
            change_pct = None

            if prev_count:
                change_pct = round(((total_count - prev_count) / prev_count * 100), 2)

            # DB에 저장
            trend = JobTrend(
                week_date=monday,
                job_category=category,
                posting_count=total_count,
                prev_week_count=prev_count,
                change_pct=change_pct,
            )
            db.add(trend)
            results["categories_collected"] += 1

            logger.info(f"[Job Trends] {category}: {total_count} postings (change: {change_pct}%)")

        db.commit()

        # 급상승 키워드 추출 (더미 구현)
        for category in JOB_CATEGORIES.keys():
            for keyword in KEYWORDS.get(category, [])[:3]:  # 상위 3개만
                job_keyword = JobKeyword(
                    week_date=monday,
                    keyword=keyword,
                    frequency=len(KEYWORDS.get(category, [])),
                    rank=KEYWORDS.get(category, []).index(keyword) + 1,
                )
                db.add(job_keyword)
                results["keywords_collected"] += 1

        db.commit()
        logger.info(f"[Job Trends] Collection completed: {results}")
        return results

    except Exception as e:
        db.rollback()
        logger.error(f"[Job Trends] Collection failed: {e}", exc_info=True)
        raise


async def get_weekly_summary(db: Session) -> dict:
    """이번 주 채용 트렌드 요약 조회"""
    week_date = datetime.now(timezone.utc).date()
    monday = week_date - timedelta(days=week_date.weekday())

    trends = db.execute(
        select(JobTrend).where(JobTrend.week_date == monday)
    ).scalars().all()

    keywords = db.execute(
        select(JobKeyword).where(JobKeyword.week_date == monday).order_by(JobKeyword.rank)
    ).scalars().all()

    total_postings = sum(t.posting_count for t in trends)

    return {
        "week_date": str(monday),
        "total_postings": total_postings,
        "categories": [
            {
                "category": t.job_category,
                "posting_count": t.posting_count,
                "change_pct": t.change_pct,
            }
            for t in trends
        ],
        "top_keywords": [k.keyword for k in keywords[:5]],
    }
