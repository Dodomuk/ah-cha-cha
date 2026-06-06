"""
백테스터 API 엔드포인트
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.models.database import get_db
from app.models.stock_news import StockMetadata
from app.models.backtest_strategy import BacktestStrategy, StrategyLike
from app.services.backtester import Backtester
import uuid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/backtest", tags=["backtester"])


# ============ Request/Response Models ============

class ConditionInput(BaseModel):
    """조건 입력"""
    type: str  # "ma_cross_above", "ma_cross_below", "rsi_below", "rsi_above"
    short_window: Optional[int] = None
    long_window: Optional[int] = None
    level: Optional[float] = None
    period: Optional[int] = None


class BacktestRequest(BaseModel):
    """백테스트 요청"""
    symbol: str
    start_date: str  # "2024-01-01"
    end_date: str    # "2024-12-31"
    conditions: list[ConditionInput]
    initial_cash: float = 1_000_000


class TradeOutput(BaseModel):
    """매매 기록"""
    date: str
    trade_type: str
    price: float
    quantity: int
    value: float
    return_pct: Optional[float] = None


class EquityPointOutput(BaseModel):
    """자산 변화 포인트"""
    date: str
    equity: float
    return_: float = 0  # Pydantic field name fix (return → return_)
    price: float = 0


class SignalOutput(BaseModel):
    """매매 신호"""
    buy: list[bool]
    sell: list[bool]


class MetricsOutput(BaseModel):
    """성과 지표"""
    total_return: float
    annual_return: float
    max_drawdown: float
    sharpe_ratio: float
    win_rate: float
    avg_win: float
    avg_loss: float
    profit_factor: float
    trades_count: int


class BacktestResponse(BaseModel):
    """백테스트 응답"""
    success: bool
    symbol: str
    name: str
    period: str
    trades: list[TradeOutput]
    equity_curve: list[dict]
    metrics: MetricsOutput
    error: Optional[str] = None


class StockOutput(BaseModel):
    """종목 정보"""
    symbol: str
    name_ko: str
    name_en: Optional[str]
    sector: Optional[str]
    market: str
    market_cap_rank: Optional[int]


class StocksListResponse(BaseModel):
    """종목 리스트 응답"""
    total: int
    stocks: list[StockOutput]


# ============ Endpoints ============

@router.post("/run", response_model=BacktestResponse)
def run_backtest(
    request: BacktestRequest,
    db: Session = Depends(get_db),
) -> BacktestResponse:
    """
    백테스트 실행

    Example:
    ```json
    {
      "symbol": "005930",
      "start_date": "2024-01-01",
      "end_date": "2024-12-31",
      "conditions": [
        {
          "type": "ma_cross_above",
          "short_window": 5,
          "long_window": 20
        }
      ],
      "initial_cash": 1000000
    }
    ```
    """
    try:
        # 조건 파싱
        conditions = []
        for cond in request.conditions:
            conditions.append({
                "type": cond.type,
                "short_window": cond.short_window,
                "long_window": cond.long_window,
                "level": cond.level,
                "period": cond.period,
            })

        # 백테스트 실행
        backtester = Backtester(db)
        result = backtester.run(
            symbol=request.symbol,
            start_date=request.start_date,
            end_date=request.end_date,
            conditions=conditions,
            initial_cash=request.initial_cash,
        )

        # 응답 생성
        trades = [
            TradeOutput(
                date=t.date,
                trade_type=t.trade_type,
                price=t.price,
                quantity=t.quantity,
                value=t.value,
                return_pct=t.return_pct,
            )
            for t in result.trades
        ]

        equity_curve = [
            {
                "date": e["date"],
                "equity": e["equity"],
                "return": e["return"],
                "price": e.get("price", 0),
            }
            for e in result.equity_curve
        ]

        metrics = MetricsOutput(**result.metrics)

        return BacktestResponse(
            success=True,
            symbol=result.symbol,
            name=result.name,
            period=result.period,
            trades=trades,
            equity_curve=equity_curve,
            metrics=metrics,
        )

    except ValueError as e:
        logger.error(f"Backtest error: {e}")
        return BacktestResponse(
            success=False,
            symbol=request.symbol,
            name="",
            period="",
            trades=[],
            equity_curve=[],
            metrics=MetricsOutput(
                total_return=0,
                annual_return=0,
                max_drawdown=0,
                sharpe_ratio=0,
                win_rate=0,
                avg_win=0,
                avg_loss=0,
                profit_factor=0,
                trades_count=0,
            ),
            error=str(e),
        )
    except Exception as e:
        logger.error(f"Unexpected error in backtest: {e}", exc_info=True)
        return BacktestResponse(
            success=False,
            symbol=request.symbol,
            name="",
            period="",
            trades=[],
            equity_curve=[],
            metrics=MetricsOutput(
                total_return=0,
                annual_return=0,
                max_drawdown=0,
                sharpe_ratio=0,
                win_rate=0,
                avg_win=0,
                avg_loss=0,
                profit_factor=0,
                trades_count=0,
            ),
            error="Internal server error",
        )


@router.get("/stocks", response_model=StocksListResponse)
def list_stocks(
    sector: Optional[str] = None,
    market: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
) -> StocksListResponse:
    """
    종목 리스트 조회

    Query Parameters:
    - sector: 섹터 필터 (예: "반도체")
    - market: 시장 필터 (예: "KOSPI", "KOSDAQ")
    - limit: 조회 개수
    """
    query = select(StockMetadata)

    if sector:
        query = query.where(StockMetadata.sector == sector)
    if market:
        query = query.where(StockMetadata.market == market)

    stocks = db.execute(query.limit(limit)).scalars().all()

    return StocksListResponse(
        total=len(stocks),
        stocks=[
            StockOutput(
                symbol=s.symbol,
                name_ko=s.name_ko,
                name_en=s.name_en,
                sector=s.sector,
                market=s.market,
                market_cap_rank=s.market_cap_rank,
            )
            for s in stocks
        ],
    )


@router.get("/stocks/{symbol}", response_model=StockOutput)
def get_stock(
    symbol: str,
    db: Session = Depends(get_db),
) -> StockOutput:
    """
    종목 상세 정보 조회

    Path Parameters:
    - symbol: 종목 코드 (예: "005930")
    """
    stock = db.execute(
        select(StockMetadata).where(StockMetadata.symbol == symbol)
    ).scalar_one_or_none()

    if not stock:
        raise HTTPException(status_code=404, detail=f"Stock {symbol} not found")

    return StockOutput(
        symbol=stock.symbol,
        name_ko=stock.name_ko,
        name_en=stock.name_en,
        sector=stock.sector,
        market=stock.market,
        market_cap_rank=stock.market_cap_rank,
    )


@router.get("/sectors")
def list_sectors(db: Session = Depends(get_db)):
    """
    섹터 리스트 조회
    """
    sectors = db.execute(
        select(StockMetadata.sector).distinct().where(StockMetadata.sector.isnot(None))
    ).scalars().all()

    return {
        "total": len(sectors),
        "sectors": sorted(list(set(sectors))),
    }


# ============ 전략 저장/공유 ============

class SaveStrategyRequest(BaseModel):
    """전략 저장 요청"""
    name: str
    description: Optional[str] = None
    symbol: str
    start_date: str
    end_date: str
    conditions: list[dict]
    total_return: float
    max_drawdown: float
    sharpe_ratio: float
    win_rate: float
    trades_count: int
    is_public: bool = False


class StrategyOut(BaseModel):
    """전략 출력"""
    id: str
    name: str
    description: Optional[str]
    symbol: str
    start_date: str
    end_date: str
    total_return: float
    max_drawdown: float
    sharpe_ratio: float
    win_rate: float
    trades_count: int
    is_public: bool
    views: int
    likes: int
    created_at: str


@router.post("/strategies/save")
def save_strategy(
    request: SaveStrategyRequest,
    db: Session = Depends(get_db),
):
    """
    백테스트 전략 저장

    Example:
    ```json
    {
      "name": "5/20 이동평균 크로스오버",
      "description": "단기 이동평균이 장기를 상향 돌파할 때 매수",
      "symbol": "005930",
      "start_date": "2024-01-01",
      "end_date": "2024-12-31",
      "conditions": [...],
      "total_return": 17.97,
      "is_public": true
    }
    ```
    """
    try:
        strategy = BacktestStrategy(
            name=request.name,
            description=request.description,
            symbol=request.symbol,
            start_date=request.start_date,
            end_date=request.end_date,
            conditions=request.conditions,
            total_return=request.total_return,
            max_drawdown=request.max_drawdown,
            sharpe_ratio=request.sharpe_ratio,
            win_rate=request.win_rate,
            trades_count=request.trades_count,
            is_public=request.is_public,
        )
        db.add(strategy)
        db.commit()

        return {
            "success": True,
            "id": str(strategy.id),
            "message": f"전략 '{request.name}'이 저장되었습니다",
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to save strategy: {e}")
        return {
            "success": False,
            "error": str(e),
        }


@router.get("/strategies/public")
def list_public_strategies(
    db: Session = Depends(get_db),
    limit: int = 50,
):
    """
    공개 전략 리스트 조회 (랭킹 순서)
    """
    strategies = db.execute(
        select(BacktestStrategy)
        .where(BacktestStrategy.is_public.is_(True))
        .order_by(BacktestStrategy.likes.desc())
        .limit(limit)
    ).scalars().all()

    return {
        "total": len(strategies),
        "strategies": [
            {
                "id": str(s.id),
                "name": s.name,
                "symbol": s.symbol,
                "total_return": s.total_return,
                "max_drawdown": s.max_drawdown,
                "sharpe_ratio": s.sharpe_ratio,
                "win_rate": s.win_rate,
                "likes": s.likes,
                "views": s.views,
                "created_at": s.created_at.isoformat(),
            }
            for s in strategies
        ],
    }


@router.get("/strategies/{strategy_id}")
def get_strategy(
    strategy_id: str,
    db: Session = Depends(get_db),
):
    """
    전략 상세 조회
    """
    try:
        strat_uuid = uuid.UUID(strategy_id)
        strategy = db.execute(
            select(BacktestStrategy).where(BacktestStrategy.id == strat_uuid)
        ).scalar_one_or_none()

        if not strategy:
            raise HTTPException(status_code=404, detail="전략을 찾을 수 없습니다")

        # 조회수 증가
        strategy.views += 1
        db.commit()

        return {
            "id": str(strategy.id),
            "name": strategy.name,
            "description": strategy.description,
            "symbol": strategy.symbol,
            "start_date": strategy.start_date,
            "end_date": strategy.end_date,
            "conditions": strategy.conditions,
            "total_return": strategy.total_return,
            "max_drawdown": strategy.max_drawdown,
            "sharpe_ratio": strategy.sharpe_ratio,
            "win_rate": strategy.win_rate,
            "trades_count": strategy.trades_count,
            "likes": strategy.likes,
            "views": strategy.views,
            "created_at": strategy.created_at.isoformat(),
        }
    except Exception as e:
        logger.error(f"Failed to get strategy: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/strategies/{strategy_id}/like")
def like_strategy(
    strategy_id: str,
    db: Session = Depends(get_db),
):
    """
    전략 좋아요 (사용자별 1회만)
    """
    try:
        strat_uuid = uuid.UUID(strategy_id)
        strategy = db.execute(
            select(BacktestStrategy).where(BacktestStrategy.id == strat_uuid)
        ).scalar_one_or_none()

        if not strategy:
            raise HTTPException(status_code=404, detail="전략을 찾을 수 없습니다")

        # 좋아요 수 증가
        strategy.likes += 1
        db.commit()

        return {"success": True, "likes": strategy.likes}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to like strategy: {e}")
        raise HTTPException(status_code=400, detail=str(e))


# ============ 종목 스크리너 ============

class ScreeningRequest(BaseModel):
    """스크리닝 요청"""
    conditions: list[ConditionInput]


class ScreeningResultItem(BaseModel):
    """스크리닝 결과 종목"""
    symbol: str
    name_ko: str
    sector: Optional[str]
    market: str
    price: float
    change_pct: float
    volume: int


class ScreeningResponse(BaseModel):
    """스크리닝 응답"""
    date: str
    total_count: int
    results: list[ScreeningResultItem]
    error: Optional[str] = None


@router.post("/screen", response_model=ScreeningResponse)
def screen_stocks(
    request: ScreeningRequest,
    db: Session = Depends(get_db),
) -> ScreeningResponse:
    """
    오늘 조건을 만족하는 종목 스크리닝

    Example:
    ```json
    {
      "conditions": [
        {
          "type": "ma_cross_above",
          "short_window": 5,
          "long_window": 20
        },
        {
          "type": "rsi_below",
          "level": 30
        }
      ]
    }
    ```
    """
    try:
        from app.services.backtester import Backtester
        from datetime import datetime, timedelta
        import yfinance as yf

        # 모든 종목 조회
        all_stocks = db.execute(select(StockMetadata)).scalars().all()

        if not all_stocks:
            return ScreeningResponse(
                date=datetime.now().strftime('%Y-%m-%d'),
                total_count=0,
                results=[],
                error="No stocks in database"
            )

        screening_results = []
        today = datetime.now().strftime('%Y-%m-%d')

        for stock in all_stocks:
            try:
                # yfinance로 최신 데이터 조회 (최근 100일)
                end_date = datetime.now()
                start_date = end_date - timedelta(days=100)

                df = yf.download(
                    stock.symbol,
                    start=start_date.strftime('%Y-%m-%d'),
                    end=end_date.strftime('%Y-%m-%d'),
                    progress=False
                )

                if df.empty or len(df) < 20:
                    continue

                # 조건 확인
                all_conditions_met = True

                for condition in request.conditions:
                    condition_met = False

                    # MA 크로스
                    if condition.type == "ma_cross_above":
                        short_ma = df['Close'].tail(condition.short_window or 5).mean()
                        long_ma = df['Close'].tail(condition.long_window or 20).mean()
                        condition_met = short_ma > long_ma

                    elif condition.type == "ma_cross_below":
                        short_ma = df['Close'].tail(condition.short_window or 5).mean()
                        long_ma = df['Close'].tail(condition.long_window or 20).mean()
                        condition_met = short_ma < long_ma

                    # RSI
                    elif condition.type in ["rsi_below", "rsi_above"]:
                        period = condition.period or 14
                        delta = df['Close'].diff()
                        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
                        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
                        rs = gain / loss
                        rsi = 100 - (100 / (1 + rs))
                        current_rsi = rsi.iloc[-1]

                        if condition.type == "rsi_below":
                            condition_met = current_rsi < (condition.level or 30)
                        else:  # rsi_above
                            condition_met = current_rsi > (condition.level or 70)

                    # Stochastic
                    elif condition.type in ["stochastic_oversold", "stochastic_overbought"]:
                        period = condition.period or 14
                        low_min = df['Low'].rolling(window=period).min()
                        high_max = df['High'].rolling(window=period).max()
                        k = 100 * (df['Close'] - low_min) / (high_max - low_min)

                        if condition.type == "stochastic_oversold":
                            condition_met = k.iloc[-1] < (condition.level or 20)
                        else:  # stochastic_overbought
                            condition_met = k.iloc[-1] > (condition.level or 80)

                    if not condition_met:
                        all_conditions_met = False
                        break

                # 모든 조건 만족 시 결과에 추가
                if all_conditions_met:
                    latest_price = df['Close'].iloc[-1]
                    prev_price = df['Close'].iloc[-2] if len(df) > 1 else latest_price
                    change_pct = round(((latest_price - prev_price) / prev_price * 100), 2)
                    volume = int(df['Volume'].iloc[-1])

                    screening_results.append(
                        ScreeningResultItem(
                            symbol=stock.symbol,
                            name_ko=stock.name_ko,
                            sector=stock.sector,
                            market=stock.market,
                            price=round(latest_price, 2),
                            change_pct=change_pct,
                            volume=volume
                        )
                    )

            except Exception as e:
                logger.warning(f"Failed to screen {stock.symbol}: {str(e)}")
                continue

        return ScreeningResponse(
            date=today,
            total_count=len(screening_results),
            results=screening_results
        )

    except Exception as e:
        logger.error(f"Screening failed: {e}", exc_info=True)
        return ScreeningResponse(
            date=datetime.now().strftime('%Y-%m-%d'),
            total_count=0,
            results=[],
            error=str(e)
        )
