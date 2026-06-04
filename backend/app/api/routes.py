from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from sqlalchemy import select, func, or_
from app.models.database import get_db
from app.models.news import NewsArticle, CountryThreatLevel
from app.models.schemas import (
    CountriesResponse, CountryNewsResponse, LatestNewsResponse,
    CountryThreatOut, NewsArticleOut, StatsResponse,
    TrendResponse, TrendPoint, SearchResponse,
)
from app.config import settings
import anthropic

router = APIRouter()


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect(conn)


manager = ConnectionManager()

KST = timezone(timedelta(hours=9))


def parse_date_range(start: Optional[str], end: Optional[str]):
    """YYYY-MM-DD KST 문자열을 UTC datetime 범위로 변환한다. 최대 7일."""
    today_kst = datetime.now(KST).date()

    try:
        end_date = datetime.strptime(end, "%Y-%m-%d").date() if end else today_kst
    except ValueError:
        end_date = today_kst

    try:
        start_date = datetime.strptime(start, "%Y-%m-%d").date() if start else (end_date - timedelta(days=6))
    except ValueError:
        start_date = end_date - timedelta(days=6)

    if start_date > end_date:
        start_date = end_date
    if (end_date - start_date).days > 6:
        start_date = end_date - timedelta(days=6)

    start_dt = datetime(start_date.year, start_date.month, start_date.day, 0, 0, 0, tzinfo=KST)
    end_dt = datetime(end_date.year, end_date.month, end_date.day, 23, 59, 59, tzinfo=KST)
    return start_dt, end_dt


@router.get("/countries", response_model=CountriesResponse)
def get_countries(
    start: Optional[str] = None,
    end: Optional[str] = None,
    db: Session = Depends(get_db),
):
    start_dt, end_dt = parse_date_range(start, end)

    date_col = func.coalesce(NewsArticle.published_at, NewsArticle.collected_at)

    # Current period: threat levels per country
    rows = db.execute(
        select(NewsArticle.country_codes, NewsArticle.threat_level)
        .where(
            date_col >= start_dt,
            date_col <= end_dt,
            NewsArticle.threat_level > 0,
            NewsArticle.ai_processed.is_(True),
            NewsArticle.country_codes.isnot(None),
        )
    ).all()

    country_max: dict[str, int] = {}
    country_count: dict[str, int] = {}
    for codes, level in rows:
        for code in (codes or []):
            code = code.upper()
            if not code:
                continue
            country_max[code] = max(country_max.get(code, 0), level)
            country_count[code] = country_count.get(code, 0) + 1

    # Previous period (shifted 1 day back) for delta computation
    prev_start_dt = start_dt - timedelta(days=1)
    prev_end_dt = end_dt - timedelta(days=1)
    prev_rows = db.execute(
        select(NewsArticle.country_codes, NewsArticle.threat_level)
        .where(
            date_col >= prev_start_dt,
            date_col <= prev_end_dt,
            NewsArticle.threat_level > 0,
            NewsArticle.ai_processed.is_(True),
            NewsArticle.country_codes.isnot(None),
        )
    ).all()
    prev_max: dict[str, int] = {}
    for codes, level in prev_rows:
        for code in (codes or []):
            code = code.upper()
            if code:
                prev_max[code] = max(prev_max.get(code, 0), level)

    # Attacker / victim role computation
    attacker_rows = db.execute(
        select(NewsArticle.attacker_codes)
        .where(
            date_col >= start_dt,
            date_col <= end_dt,
            NewsArticle.ai_processed.is_(True),
            NewsArticle.attacker_codes.isnot(None),
        )
    ).scalars().all()
    victim_rows = db.execute(
        select(NewsArticle.victim_codes)
        .where(
            date_col >= start_dt,
            date_col <= end_dt,
            NewsArticle.ai_processed.is_(True),
            NewsArticle.victim_codes.isnot(None),
        )
    ).scalars().all()

    attacker_set: set[str] = set()
    victim_set: set[str] = set()
    for codes in attacker_rows:
        for code in (codes or []):
            attacker_set.add(code.upper())
    for codes in victim_rows:
        for code in (codes or []):
            victim_set.add(code.upper())

    def get_role(code: str) -> str | None:
        is_a = code in attacker_set
        is_v = code in victim_set
        if is_a and is_v:
            return "both"
        if is_a:
            return "attacker"
        if is_v:
            return "victim"
        return None

    countries: dict[str, CountryThreatOut] = {
        code: CountryThreatOut(
            threat_level=level,
            article_count=country_count[code],
            delta=level - prev_max.get(code, 0),
            role=get_role(code),
        )
        for code, level in country_max.items()
    }

    return CountriesResponse(
        snapshot_at=datetime.now(timezone.utc),
        countries=countries,
    )


@router.get("/countries/{code}/news", response_model=CountryNewsResponse)
def get_country_news(
    code: str,
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    code = code.upper()
    start_dt, end_dt = parse_date_range(start, end)
    limit = min(limit, 50)

    date_col = func.coalesce(NewsArticle.published_at, NewsArticle.collected_at)
    articles = db.execute(
        select(NewsArticle)
        .where(
            NewsArticle.country_codes.any(code),
            date_col >= start_dt,
            date_col <= end_dt,
            NewsArticle.ai_processed.is_(True),
        )
        .order_by(NewsArticle.threat_level.desc(), date_col.desc())
        .limit(limit)
    ).scalars().all()

    max_level = max((a.threat_level for a in articles), default=0)

    return CountryNewsResponse(
        country_code=code,
        threat_level=max_level,
        articles=[NewsArticleOut.model_validate(a) for a in articles],
    )


@router.get("/countries/{code}/trend", response_model=TrendResponse)
def get_country_trend(code: str, db: Session = Depends(get_db)):
    code = code.upper()
    now_kst = datetime.now(KST)
    week_start = (now_kst - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = now_kst.replace(hour=23, minute=59, second=59, microsecond=0)

    date_col = func.coalesce(NewsArticle.published_at, NewsArticle.collected_at)
    rows = db.execute(
        select(date_col.label("d"), NewsArticle.threat_level)
        .where(
            NewsArticle.country_codes.any(code),
            date_col >= week_start,
            date_col <= today_end,
            NewsArticle.ai_processed.is_(True),
        )
    ).all()

    day_max: dict[str, int] = {}
    for date_val, level in rows:
        day = date_val.astimezone(KST).strftime("%Y-%m-%d")
        day_max[day] = max(day_max.get(day, 0), level)

    points = []
    for i in range(6, -1, -1):
        d = (now_kst - timedelta(days=i)).strftime("%Y-%m-%d")
        points.append(TrendPoint(date=d, level=day_max.get(d, 0)))

    return TrendResponse(points=points)


@router.get("/search", response_model=SearchResponse)
def search_news(q: str = "", limit: int = 20, db: Session = Depends(get_db)):
    limit = min(limit, 50)
    q = q.strip()
    if not q:
        return SearchResponse(articles=[], query=q)

    pattern = f"%{q}%"
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)

    articles = db.execute(
        select(NewsArticle)
        .where(
            NewsArticle.ai_processed.is_(True),
            NewsArticle.collected_at >= cutoff,
            or_(
                NewsArticle.summary_title.ilike(pattern),
                NewsArticle.summary_what.ilike(pattern),
                NewsArticle.source_title.ilike(pattern),
            ),
        )
        .order_by(NewsArticle.threat_level.desc(), NewsArticle.collected_at.desc())
        .limit(limit)
    ).scalars().all()

    return SearchResponse(
        articles=[NewsArticleOut.model_validate(a) for a in articles],
        query=q,
    )


@router.get("/stats", response_model=StatsResponse)
def get_stats(db: Session = Depends(get_db)):
    now_kst = datetime.now(KST)
    today_start = now_kst.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=6)

    today_count = db.execute(
        select(func.count()).select_from(NewsArticle).where(
            NewsArticle.collected_at >= today_start,
            NewsArticle.threat_level > 0,
            NewsArticle.ai_processed.is_(True),
        )
    ).scalar() or 0

    level_rows = db.execute(
        select(NewsArticle.threat_level, func.count()).where(
            NewsArticle.collected_at >= week_start,
            NewsArticle.threat_level > 0,
            NewsArticle.ai_processed.is_(True),
        ).group_by(NewsArticle.threat_level)
    ).all()

    by_level = {str(lvl): cnt for lvl, cnt in level_rows}
    for lvl in ("1", "2", "3", "4"):
        by_level.setdefault(lvl, 0)

    return StatsResponse(
        total_7d=sum(by_level.values()),
        today=today_count,
        by_level=by_level,
    )


@router.get("/news/latest", response_model=LatestNewsResponse)
def get_latest_news(
    limit: int = 30,
    min_level: int = 1,
    date: Optional[str] = None,   # YYYY-MM-DD (KST 기준). 미입력 시 오늘
    db: Session = Depends(get_db),
):
    limit = min(limit, 100)
    today_kst = datetime.now(KST).date()

    try:
        target_date = datetime.strptime(date, "%Y-%m-%d").date() if date else today_kst
    except ValueError:
        target_date = today_kst

    # 미래 날짜는 오늘로 클램프
    if target_date > today_kst:
        target_date = today_kst

    # KST → UTC 명시적 변환 (PostgreSQL timezone 비교 오차 방지)
    kst_start = datetime(target_date.year, target_date.month, target_date.day,
                         0, 0, 0, tzinfo=KST)
    start_dt = kst_start.astimezone(timezone.utc)

    if target_date >= today_kst:
        end_dt = datetime.now(timezone.utc)
    else:
        kst_end = datetime(target_date.year, target_date.month, target_date.day,
                           23, 59, 59, tzinfo=KST)
        end_dt = kst_end.astimezone(timezone.utc)

    articles = db.execute(
        select(NewsArticle)
        .where(
            NewsArticle.threat_level >= min_level,
            NewsArticle.collected_at >= start_dt,
            NewsArticle.collected_at <= end_dt,
            NewsArticle.ai_processed.is_(True),
        )
        .order_by(NewsArticle.threat_level.desc(), NewsArticle.collected_at.desc())
        .limit(limit)
    ).scalars().all()

    return LatestNewsResponse(articles=[NewsArticleOut.model_validate(a) for a in articles])


@router.post("/internal/collect")
async def trigger_collection(
    x_internal_key: str = Header(alias="X-Internal-Key"),
):
    if x_internal_key != settings.internal_api_key:
        raise HTTPException(status_code=403, detail="Forbidden")

    from app.services.collector import run_collection_cycle
    from app.models.database import SessionLocal
    import asyncio

    async def _run():
        db = SessionLocal()
        try:
            await run_collection_cycle(db)
        finally:
            db.close()

    asyncio.create_task(_run())
    mode = "TEST_MODE(요약 제외)" if settings.test_mode else "자동 요약 포함"
    return {"message": f"collection job accepted [{mode}]"}


@router.post("/internal/summarize")
async def trigger_summarization(
    x_internal_key: str = Header(alias="X-Internal-Key"),
):
    """미처리 기사들을 Claude API로 요약한다. TEST_MODE에서 수동 실행용."""
    if x_internal_key != settings.internal_api_key:
        raise HTTPException(status_code=403, detail="Forbidden")

    from app.services.collector import run_summarization_cycle
    from app.models.database import SessionLocal
    from sqlalchemy import select
    from app.models.news import NewsArticle

    db = SessionLocal()
    try:
        pending_count = db.execute(
            select(func.count()).select_from(NewsArticle).where(NewsArticle.ai_processed.is_(False))
        ).scalar()
    finally:
        db.close()

    if pending_count == 0:
        return {"message": "요약 대기 기사 없음", "pending": 0}

    import asyncio

    async def _run():
        db = SessionLocal()
        try:
            await run_summarization_cycle(db)
        finally:
            db.close()

    asyncio.create_task(_run())
    return {"message": f"summarization job accepted", "pending": pending_count}


@router.post("/internal/retranslate")
async def trigger_retranslation(
    x_internal_key: str = Header(alias="X-Internal-Key"),
    limit: int = 50,
):
    """영어 요약이 없는 기존 기사들에 영어 필드를 추가한다. 50건씩 반복 호출."""
    if x_internal_key != settings.internal_api_key:
        raise HTTPException(status_code=403, detail="Forbidden")

    import asyncio
    from app.services.collector import run_retranslation_cycle
    from app.models.database import SessionLocal

    async def _run():
        db = SessionLocal()
        try:
            await run_retranslation_cycle(db, limit=limit)
        finally:
            db.close()

    asyncio.create_task(_run())
    return {"message": "retranslation job accepted", "limit": limit}


def extract_keywords(text: str, max_keywords: int = 3) -> list[str]:
    """텍스트에서 주요 키워드 추출 (단어 길이 4자 이상, 대문자 단어 우선)."""
    if not text:
        return []

    # 대문자로 시작하거나 모두 대문자인 단어들 추출 (고유명사 우선)
    words = text.split()
    proper_nouns = [w.strip('.,!?;:') for w in words if len(w.strip('.,!?;:')) >= 4 and (w[0].isupper() or w.isupper())]

    # 중복 제거 (순서 보존)
    seen = set()
    keywords = []
    for word in proper_nouns:
        if word.lower() not in seen and word.lower() not in ['the', 'and', 'that', 'this']:
            keywords.append(word)
            seen.add(word.lower())
            if len(keywords) >= max_keywords:
                break

    return keywords if keywords else []


def is_korean(text: str) -> bool:
    """텍스트에 한국어가 포함되어 있는지 확인."""
    if not text:
        return False
    for char in text:
        if ord(char) >= 0xAC00 and ord(char) <= 0xD7A3:  # 한글 범위
            return True
    return False


def translate_to_english(text: str) -> str:
    """한국어 텍스트를 영어로 번역 (Claude API 사용). 한국어가 없으면 원본 반환."""
    if not text:
        return text

    # 한국어가 없으면 그대로 반환
    if not is_korean(text):
        return text

    try:
        client = anthropic.Anthropic(api_key=settings.claude_api_key)
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[
                {
                    "role": "user",
                    "content": f"Translate the following Korean text to English. Return ONLY the translation, nothing else:\n\n{text}"
                }
            ]
        )
        translated = message.content[0].text.strip()
        print(f"Translated: {text[:50]}... -> {translated[:50]}...")
        return translated
    except Exception as e:
        print(f"Translation error: {e}")
        return text


@router.get("/events")
def get_events(
    limit: int = 50,
    category: Optional[str] = None,
    language: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """최근 이벤트 목록 (뉴스 기반). 자동 영어 번역 포함."""
    query = select(NewsArticle).where(
        NewsArticle.ai_processed.is_(True),
        NewsArticle.threat_level > 0,
    )

    if category:
        query = query.where(NewsArticle.category == category)

    query = query.order_by(NewsArticle.collected_at.desc()).limit(min(limit, 100))
    articles = db.execute(query).scalars().all()

    events = []
    for a in articles:
        # 제목과 요약을 영어로 변환 (저장된 영어 버전이 한국어이면 다시 번역)
        title = a.summary_title if a.summary_title else ""
        summary = a.summary_what if a.summary_what else ""

        # 항상 번역 시도 (한국어가 없으면 원본 반환)
        title_en = translate_to_english(title)
        summary_en = translate_to_english(summary)

        keywords_text = summary_en + " " + title_en

        events.append({
            "id": str(a.id),
            "title": title_en,
            "summary": summary_en,
            "category": a.category or "general",
            "keywords": extract_keywords(keywords_text),
            "threat_level": a.threat_level,
            "countries": a.country_codes or [],
            "animation_config": a.animation_config,
            "collected_at": a.collected_at.isoformat() if a.collected_at else None,
        })

    return {"events": events}


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """실시간 뉴스 이벤트 스트리밍."""
    # WebSocket 연결 수락 (CORS 확인)
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
