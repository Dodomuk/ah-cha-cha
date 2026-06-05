"""
백테스트 엔진

과거 데이터 기반 매매 시뮬레이션 및 성과 계산
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from dataclasses import dataclass
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.models.stock_news import StockMetadata
from app.services.signals import SignalGenerator, ConditionEvaluator

logger = logging.getLogger(__name__)


@dataclass
class Trade:
    """매매 기록"""
    date: str
    trade_type: str  # "BUY" or "SELL"
    price: float
    quantity: int
    value: float
    return_pct: Optional[float] = None  # SELL일 때만 계산


@dataclass
class BacktestResult:
    """백테스트 결과"""
    symbol: str
    name: str
    period: str
    trades: list[Trade]
    equity_curve: list[dict]  # [{"date": "2024-01-01", "equity": 1000000, "return": 0}]
    signals: dict  # {"buy": [...], "sell": [...]}
    metrics: dict  # 성과 지표


class Backtester:
    """백테스트 엔진"""

    def __init__(self, db: Session):
        self.db = db

    def run(
        self,
        symbol: str,
        start_date: str,  # "2024-01-01"
        end_date: str,    # "2024-12-31"
        conditions: list[dict],
        initial_cash: float = 1_000_000,
    ) -> BacktestResult:
        """
        백테스트 실행

        Args:
            symbol: 종목 코드 (예: "005930")
            start_date: 시작 날짜
            end_date: 종료 날짜
            conditions: 조건 리스트
            initial_cash: 초기 자본금

        Returns:
            BacktestResult
        """
        logger.info(f"Starting backtest: {symbol} ({start_date} ~ {end_date})")

        # 1. 종목 정보 조회
        stock = self.db.execute(
            select(StockMetadata).where(StockMetadata.symbol == symbol)
        ).scalar_one_or_none()

        if not stock:
            raise ValueError(f"Unsupported symbol: {symbol}")

        # 2. 과거 데이터 로드 (mock 데이터 - 실제로는 DB에서 로드)
        data = self._load_price_data(symbol, start_date, end_date)
        if not data:
            raise ValueError(f"No data available for {symbol} in {start_date} ~ {end_date}")

        # 3. 기술적 지표 계산
        indicators = self._calculate_indicators(data)

        # 4. 매매 신호 생성
        signals = self._generate_signals(indicators, conditions)

        # 5. 매매 시뮬레이션
        trades, equity_curve = self._simulate_trades(
            data, signals, initial_cash
        )

        # 6. 성과 지표 계산
        metrics = self._calculate_metrics(
            equity_curve, trades, initial_cash
        )

        period = f"{start_date} ~ {end_date}"

        return BacktestResult(
            symbol=symbol,
            name=stock.name_ko,
            period=period,
            trades=trades,
            equity_curve=equity_curve,
            signals=signals,
            metrics=metrics,
        )

    def _load_price_data(
        self, symbol: str, start_date: str, end_date: str
    ) -> list[dict]:
        """
        과거 가격 데이터 로드 (yfinance 사용)

        한국 주식은 .KS 또는 .KQ suffix 필요
        """
        try:
            import yfinance as yf
            from datetime import datetime

            # 심볼에 suffix 추가 (한국 주식)
            ticker_symbol = f"{symbol}.KS"

            # yfinance에서 데이터 가져오기
            df = yf.download(
                ticker_symbol,
                start=start_date,
                end=end_date,
                progress=False,
                interval="1d"
            )

            if df.empty:
                logger.warning(f"No data for {ticker_symbol}, trying .KQ suffix")
                ticker_symbol = f"{symbol}.KQ"
                df = yf.download(
                    ticker_symbol,
                    start=start_date,
                    end=end_date,
                    progress=False,
                    interval="1d"
                )

            if df.empty:
                logger.error(f"No data available for {symbol}")
                return []

            # 데이터 포맷 변환
            data = []
            for date, row in df.iterrows():
                data.append({
                    "date": date.strftime("%Y-%m-%d"),
                    "open": float(row["Open"]),
                    "high": float(row["High"]),
                    "low": float(row["Low"]),
                    "close": float(row["Close"]),
                    "volume": int(row["Volume"]),
                })

            logger.info(f"Loaded {len(data)} records for {symbol}")
            return data

        except Exception as e:
            logger.error(f"Failed to load price data from yfinance: {e}")
            # yfinance 실패 시 mock 데이터로 폴백
            return self._load_mock_price_data(start_date, end_date)

    def _load_mock_price_data(self, start_date: str, end_date: str) -> list[dict]:
        """Mock 데이터 (yfinance 실패 시 폴백)"""
        import random
        from datetime import datetime, timedelta

        start = datetime.strptime(start_date, "%Y-%m-%d")
        end = datetime.strptime(end_date, "%Y-%m-%d")

        data = []
        current_price = 100000
        current = start

        while current <= end:
            if current.weekday() < 5:
                change_pct = random.uniform(-0.02, 0.02)
                open_price = current_price
                close_price = open_price * (1 + change_pct)
                high_price = max(open_price, close_price) * 1.01
                low_price = min(open_price, close_price) * 0.99

                data.append({
                    "date": current.strftime("%Y-%m-%d"),
                    "open": round(open_price, 2),
                    "high": round(high_price, 2),
                    "low": round(low_price, 2),
                    "close": round(close_price, 2),
                    "volume": random.randint(1_000_000, 10_000_000),
                })

                current_price = close_price

            current += timedelta(days=1)

        return data

    def _calculate_indicators(self, data: list[dict]) -> dict:
        """기술적 지표 계산"""
        closes = [d["close"] for d in data]
        highs = [d["high"] for d in data]
        lows = [d["low"] for d in data]

        # 이동평균
        ma5 = SignalGenerator.sma(closes, 5)
        ma20 = SignalGenerator.sma(closes, 20)
        ma60 = SignalGenerator.sma(closes, 60)

        # RSI
        rsi14 = SignalGenerator.rsi(closes, 14)

        # MACD
        macd, signal, histogram = SignalGenerator.macd(closes)

        # 볼린저 밴드
        bb_upper, bb_middle, bb_lower = SignalGenerator.bollinger_bands(closes, 20)

        # Stochastic Oscillator
        k_line, d_line = SignalGenerator.stochastic(highs, lows, closes, 14)

        return {
            "ma5": ma5,
            "ma20": ma20,
            "ma60": ma60,
            "rsi14": rsi14,
            "macd": macd,
            "macd_signal": signal,
            "macd_histogram": histogram,
            "bb_upper": bb_upper,
            "bb_middle": bb_middle,
            "bb_lower": bb_lower,
            "stochastic_k": k_line,
            "stochastic_d": d_line,
        }

    def _generate_signals(self, indicators: dict, conditions: list[dict]) -> dict:
        """
        매매 신호 생성

        조건 형식:
        [
            {
                "type": "ma_cross_above",
                "short_window": 5,
                "long_window": 20
            },
            {
                "type": "rsi_below",
                "period": 14,
                "level": 30
            }
        ]
        """
        buy_signals = [False] * len(indicators["ma5"])
        sell_signals = [False] * len(indicators["ma5"])

        for condition in conditions:
            cond_type = condition.get("type")

            if cond_type == "ma_cross_above":
                short_window = condition.get("short_window", 5)
                long_window = condition.get("long_window", 20)

                if short_window == 5:
                    ma_short = indicators["ma5"]
                elif short_window == 20:
                    ma_short = indicators["ma20"]
                else:
                    ma_short = SignalGenerator.sma(
                        [d["close"] for d in []], short_window
                    )

                if long_window == 20:
                    ma_long = indicators["ma20"]
                elif long_window == 60:
                    ma_long = indicators["ma60"]
                else:
                    ma_long = []

                signals = ConditionEvaluator.ma_cross_above(ma_short, ma_long)
                buy_signals = ConditionEvaluator.or_condition(buy_signals, signals)

            elif cond_type == "ma_cross_below":
                short_window = condition.get("short_window", 5)
                long_window = condition.get("long_window", 20)

                if short_window == 5:
                    ma_short = indicators["ma5"]
                elif short_window == 20:
                    ma_short = indicators["ma20"]
                else:
                    ma_short = []

                if long_window == 20:
                    ma_long = indicators["ma20"]
                elif long_window == 60:
                    ma_long = indicators["ma60"]
                else:
                    ma_long = []

                signals = ConditionEvaluator.ma_cross_below(ma_short, ma_long)
                sell_signals = ConditionEvaluator.or_condition(sell_signals, signals)

            elif cond_type == "rsi_below":
                level = condition.get("level", 30)
                signals = ConditionEvaluator.rsi_below(indicators["rsi14"], level)
                buy_signals = ConditionEvaluator.or_condition(buy_signals, signals)

            elif cond_type == "rsi_above":
                level = condition.get("level", 70)
                signals = ConditionEvaluator.rsi_above(indicators["rsi14"], level)
                sell_signals = ConditionEvaluator.or_condition(sell_signals, signals)

            elif cond_type == "stochastic_oversold":
                level = condition.get("level", 20)
                signals = ConditionEvaluator.stochastic_oversold(indicators["stochastic_k"], level)
                buy_signals = ConditionEvaluator.or_condition(buy_signals, signals)

            elif cond_type == "stochastic_overbought":
                level = condition.get("level", 80)
                signals = ConditionEvaluator.stochastic_overbought(indicators["stochastic_k"], level)
                sell_signals = ConditionEvaluator.or_condition(sell_signals, signals)

            elif cond_type == "bb_lower_break":
                closes = [d["close"] for d in []]  # 이건 실제로는 data에서 와야 함
                # 백테스터에서 data를 전달할 때 수정 필요
                pass

            elif cond_type == "bb_upper_break":
                # 백테스터에서 data를 전달할 때 수정 필요
                pass

        return {
            "buy": buy_signals,
            "sell": sell_signals,
        }

    def _simulate_trades(
        self, data: list[dict], signals: dict, initial_cash: float
    ) -> tuple[list[Trade], list[dict]]:
        """
        매매 시뮬레이션

        Returns:
            (매매 기록, 자산 변화)
        """
        trades: list[Trade] = []
        equity_curve: list[dict] = []

        cash = initial_cash
        position = 0  # 보유 주식 수
        entry_price = 0  # 매수 가격

        buy_signals = signals.get("buy", [False] * len(data))
        sell_signals = signals.get("sell", [False] * len(data))

        for i, candle in enumerate(data):
            date = candle["date"]
            price = candle["close"]

            # 자산 계산
            equity = cash + (position * price)
            return_pct = ((equity - initial_cash) / initial_cash) * 100

            equity_curve.append({
                "date": date,
                "equity": round(equity, 2),
                "return": round(return_pct, 2),
                "price": price,
            })

            # 매수 신호
            if buy_signals[i] and position == 0:
                # 자금의 95%로 매수 (5% 현금 보유)
                buy_amount = cash * 0.95
                quantity = int(buy_amount / price)

                if quantity > 0:
                    position = quantity
                    entry_price = price
                    cash -= quantity * price

                    trades.append(Trade(
                        date=date,
                        trade_type="BUY",
                        price=price,
                        quantity=quantity,
                        value=quantity * price,
                    ))

            # 매도 신호
            if sell_signals[i] and position > 0:
                sell_price = price
                sell_value = position * sell_price
                return_pct = ((sell_price - entry_price) / entry_price) * 100

                trades.append(Trade(
                    date=date,
                    trade_type="SELL",
                    price=sell_price,
                    quantity=position,
                    value=sell_value,
                    return_pct=return_pct,
                ))

                cash += sell_value
                position = 0

        # 마지막에 보유 중인 주식 매도
        if position > 0:
            last_price = data[-1]["close"]
            sell_value = position * last_price
            return_pct = ((last_price - entry_price) / entry_price) * 100

            trades.append(Trade(
                date=data[-1]["date"],
                trade_type="SELL",
                price=last_price,
                quantity=position,
                value=sell_value,
                return_pct=return_pct,
            ))

            cash += sell_value

        return trades, equity_curve

    def _calculate_metrics(
        self, equity_curve: list[dict], trades: list[Trade], initial_cash: float
    ) -> dict:
        """성과 지표 계산"""
        if not equity_curve:
            return {}

        final_equity = equity_curve[-1]["equity"]
        total_return = ((final_equity - initial_cash) / initial_cash) * 100

        # MDD (최대낙폭)
        peak = initial_cash
        mdd = 0
        for point in equity_curve:
            equity = point["equity"]
            drawdown = ((peak - equity) / peak) * 100
            mdd = min(mdd, -drawdown)
            peak = max(peak, equity)

        # 승률, 평균 수익률
        sell_trades = [t for t in trades if t.trade_type == "SELL"]
        winning_trades = [t for t in sell_trades if t.return_pct and t.return_pct > 0]
        losing_trades = [t for t in sell_trades if t.return_pct and t.return_pct <= 0]

        win_rate = (len(winning_trades) / len(sell_trades) * 100) if sell_trades else 0
        avg_win = sum(t.return_pct for t in winning_trades) / len(winning_trades) if winning_trades else 0
        avg_loss = sum(t.return_pct for t in losing_trades) / len(losing_trades) if losing_trades else 0

        # Profit Factor
        total_win = sum(t.return_pct * t.value / 100 for t in winning_trades) if winning_trades else 0
        total_loss = abs(sum(t.return_pct * t.value / 100 for t in losing_trades)) if losing_trades else 0
        profit_factor = total_win / total_loss if total_loss > 0 else 0

        # Sharpe Ratio (간단한 버전)
        returns = [e["return"] for e in equity_curve]
        if len(returns) > 1:
            import numpy as np
            sharpe_ratio = np.mean(returns) / (np.std(returns) + 1e-8) if np.std(returns) > 0 else 0
        else:
            sharpe_ratio = 0

        return {
            "total_return": round(total_return, 2),
            "annual_return": round(total_return / (len(equity_curve) / 252) if len(equity_curve) > 0 else 0, 2),
            "max_drawdown": round(mdd, 2),
            "sharpe_ratio": round(sharpe_ratio, 2),
            "win_rate": round(win_rate, 2),
            "avg_win": round(avg_win, 2),
            "avg_loss": round(avg_loss, 2),
            "profit_factor": round(profit_factor, 2),
            "trades_count": len(sell_trades),
        }
