"""
기술적 지표 계산 및 매매 신호 생성

지표:
- 이동평균 (SMA, EMA)
- RSI (상대강도지수)
- MACD (이동평균수렴발산)
"""

import logging
from typing import Optional
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


class SignalGenerator:
    """기술적 지표 계산 및 매매 신호 생성"""

    @staticmethod
    def sma(prices: list[float], window: int) -> list[Optional[float]]:
        """
        단순 이동평균 (Simple Moving Average)

        Args:
            prices: 종가 리스트
            window: 기간 (예: 5, 20, 60)

        Returns:
            이동평균 리스트 (처음 window-1개는 None)
        """
        if len(prices) < window:
            return [None] * len(prices)

        result = [None] * (window - 1)
        for i in range(window, len(prices) + 1):
            result.append(sum(prices[i - window : i]) / window)

        return result

    @staticmethod
    def ema(prices: list[float], window: int) -> list[Optional[float]]:
        """
        지수 이동평균 (Exponential Moving Average)

        Args:
            prices: 종가 리스트
            window: 기간

        Returns:
            EMA 리스트 (처음 window-1개는 None)
        """
        if len(prices) < window:
            return [None] * len(prices)

        result = [None] * (window - 1)
        multiplier = 2 / (window + 1)

        # 첫 EMA는 SMA로 계산
        first_sma = sum(prices[:window]) / window
        result.append(first_sma)

        # 이후는 지수 계산
        for i in range(window, len(prices)):
            ema_val = prices[i] * multiplier + result[-1] * (1 - multiplier)
            result.append(ema_val)

        return result

    @staticmethod
    def rsi(prices: list[float], period: int = 14) -> list[Optional[float]]:
        """
        상대강도지수 (Relative Strength Index)

        RSI = 100 - (100 / (1 + RS))
        RS = 평균 상승폭 / 평균 하락폭

        Args:
            prices: 종가 리스트
            period: 기간 (기본값: 14)

        Returns:
            RSI 리스트 (0~100, 처음 period개는 None)
        """
        if len(prices) < period + 1:
            return [None] * len(prices)

        deltas = np.diff(prices)
        gains = np.where(deltas > 0, deltas, 0)
        losses = np.where(deltas < 0, -deltas, 0)

        result = [None] * period

        # 첫 번째 평균 (단순 평균)
        avg_gain = np.sum(gains[:period]) / period
        avg_loss = np.sum(losses[:period]) / period

        # RSI 계산
        if avg_loss == 0:
            result.append(100.0 if avg_gain > 0 else 0.0)
        else:
            rs = avg_gain / avg_loss
            rsi_val = 100 - (100 / (1 + rs))
            result.append(rsi_val)

        # 이후는 스무싱 (Wilder's smoothing)
        multiplier = 1 / period
        for i in range(period + 1, len(prices)):
            gain = gains[i - 1]
            loss = losses[i - 1]

            avg_gain = (avg_gain * (period - 1) + gain) / period
            avg_loss = (avg_loss * (period - 1) + loss) / period

            if avg_loss == 0:
                rsi_val = 100.0 if avg_gain > 0 else 0.0
            else:
                rs = avg_gain / avg_loss
                rsi_val = 100 - (100 / (1 + rs))

            result.append(rsi_val)

        return result

    @staticmethod
    def macd(
        prices: list[float], fast: int = 12, slow: int = 26, signal: int = 9
    ) -> tuple[list[Optional[float]], list[Optional[float]], list[Optional[float]]]:
        """
        MACD (이동평균수렴발산)

        MACD = EMA12 - EMA26
        Signal = EMA9(MACD)
        Histogram = MACD - Signal

        Args:
            prices: 종가 리스트
            fast: 빠른 EMA 기간 (기본값: 12)
            slow: 느린 EMA 기간 (기본값: 26)
            signal: 신호선 기간 (기본값: 9)

        Returns:
            (MACD, Signal, Histogram) 튜플
        """
        if len(prices) < slow + signal - 1:
            empty = [None] * len(prices)
            return (empty, empty, empty)

        # EMA 계산
        ema_fast = SignalGenerator.ema(prices, fast)
        ema_slow = SignalGenerator.ema(prices, slow)

        # MACD = EMA12 - EMA26
        macd_line = [
            fast - slow if fast is not None and slow is not None else None
            for fast, slow in zip(ema_fast, ema_slow)
        ]

        # Signal line = EMA9(MACD)
        # MACD 값만 필터링하여 signal line 계산
        macd_values = [v for v in macd_line if v is not None]
        if len(macd_values) >= signal:
            signal_ema = SignalGenerator.ema(macd_values, signal)
            # signal_line을 원래 길이에 맞춰 다시 구성
            signal_line = [None] * (len(macd_line) - len(signal_ema))
            signal_line.extend(signal_ema)
        else:
            signal_line = [None] * len(macd_line)

        # Histogram = MACD - Signal
        histogram = [
            macd - sig if macd is not None and sig is not None else None
            for macd, sig in zip(macd_line, signal_line)
        ]

        return (macd_line, signal_line, histogram)

    @staticmethod
    def bollinger_bands(
        prices: list[float], period: int = 20, std_dev: float = 2
    ) -> tuple[list[Optional[float]], list[Optional[float]], list[Optional[float]]]:
        """
        볼린저 밴드

        Args:
            prices: 종가 리스트
            period: 기간 (기본값: 20)
            std_dev: 표준편차 배수 (기본값: 2)

        Returns:
            (상단, 중단(SMA), 하단) 튜플
        """
        if len(prices) < period:
            empty = [None] * len(prices)
            return (empty, empty, empty)

        sma_line = SignalGenerator.sma(prices, period)
        middle = sma_line.copy()

        upper = []
        lower = []

        for i in range(len(prices)):
            if i < period - 1:
                upper.append(None)
                lower.append(None)
            else:
                # 표준편차 계산
                window_prices = prices[i - period + 1 : i + 1]
                std = np.std(window_prices)
                sma_val = sma_line[i]

                upper.append(sma_val + (std * std_dev))
                lower.append(sma_val - (std * std_dev))

        return (upper, middle, lower)

    @staticmethod
    def stochastic(
        high: list[float], low: list[float], close: list[float], period: int = 14
    ) -> tuple[list[Optional[float]], list[Optional[float]]]:
        """
        Stochastic Oscillator (확률론)

        %K = (Close - Lowest Low) / (Highest High - Lowest Low) * 100
        %D = 3-period SMA of %K

        Args:
            high: 고가 리스트
            low: 저가 리스트
            close: 종가 리스트
            period: 기간 (기본값: 14)

        Returns:
            (%K, %D) 튜플
        """
        if len(close) < period:
            empty = [None] * len(close)
            return (empty, empty)

        k_line = []
        for i in range(len(close)):
            if i < period - 1:
                k_line.append(None)
            else:
                # period 구간 내 최고가, 최저가
                highest = max(high[i - period + 1 : i + 1])
                lowest = min(low[i - period + 1 : i + 1])

                if highest == lowest:
                    k_line.append(50.0)
                else:
                    k = ((close[i] - lowest) / (highest - lowest)) * 100
                    k_line.append(k)

        # %D는 %K의 3-period SMA
        k_values_only = [v for v in k_line if v is not None]
        if len(k_values_only) >= 3:
            d_ema = SignalGenerator.sma(k_values_only, 3)
            # d_line을 원래 길이에 맞춰 다시 구성
            d_line = [None] * (len(k_line) - len(d_ema))
            d_line.extend(d_ema)
        else:
            d_line = [None] * len(k_line)

        return (k_line, d_line)


class ConditionEvaluator:
    """조건 평가 클래스"""

    @staticmethod
    def ma_cross_above(ma_short: list[Optional[float]], ma_long: list[Optional[float]]) -> list[bool]:
        """
        단기 이동평균이 장기 이동평균을 상향 돌파

        Args:
            ma_short: 단기 이동평균
            ma_long: 장기 이동평균

        Returns:
            각 날짜에서 조건 충족 여부 (True/False)
        """
        result = [False] * len(ma_short)

        for i in range(1, len(ma_short)):
            short_curr = ma_short[i]
            short_prev = ma_short[i - 1]
            long_curr = ma_long[i]
            long_prev = ma_long[i - 1]

            if (
                short_curr is not None
                and short_prev is not None
                and long_curr is not None
                and long_prev is not None
                and short_prev <= long_prev
                and short_curr > long_curr
            ):
                result[i] = True

        return result

    @staticmethod
    def ma_cross_below(ma_short: list[Optional[float]], ma_long: list[Optional[float]]) -> list[bool]:
        """
        단기 이동평균이 장기 이동평균을 하향 돌파

        Args:
            ma_short: 단기 이동평균
            ma_long: 장기 이동평균

        Returns:
            각 날짜에서 조건 충족 여부
        """
        result = [False] * len(ma_short)

        for i in range(1, len(ma_short)):
            short_curr = ma_short[i]
            short_prev = ma_short[i - 1]
            long_curr = ma_long[i]
            long_prev = ma_long[i - 1]

            if (
                short_curr is not None
                and short_prev is not None
                and long_curr is not None
                and long_prev is not None
                and short_prev >= long_prev
                and short_curr < long_curr
            ):
                result[i] = True

        return result

    @staticmethod
    def rsi_below(rsi_values: list[Optional[float]], threshold: float) -> list[bool]:
        """
        RSI가 임계값 아래

        Args:
            rsi_values: RSI 값 리스트
            threshold: 임계값 (예: 30)

        Returns:
            조건 충족 여부
        """
        return [
            v is not None and v < threshold
            for v in rsi_values
        ]

    @staticmethod
    def rsi_above(rsi_values: list[Optional[float]], threshold: float) -> list[bool]:
        """
        RSI가 임계값 위

        Args:
            rsi_values: RSI 값 리스트
            threshold: 임계값 (예: 70)

        Returns:
            조건 충족 여부
        """
        return [
            v is not None and v > threshold
            for v in rsi_values
        ]

    @staticmethod
    def macd_cross_above(
        macd_line: list[Optional[float]], signal_line: list[Optional[float]]
    ) -> list[bool]:
        """
        MACD가 신호선을 상향 돌파

        Args:
            macd_line: MACD 값
            signal_line: 신호선 값

        Returns:
            조건 충족 여부
        """
        result = [False] * len(macd_line)

        for i in range(1, len(macd_line)):
            if (
                macd_line[i] is not None
                and macd_line[i - 1] is not None
                and signal_line[i] is not None
                and signal_line[i - 1] is not None
                and macd_line[i - 1] <= signal_line[i - 1]
                and macd_line[i] > signal_line[i]
            ):
                result[i] = True

        return result

    @staticmethod
    def and_condition(*conditions: list[bool]) -> list[bool]:
        """
        여러 조건의 AND

        Args:
            *conditions: 조건 리스트들

        Returns:
            모든 조건이 True인 인덱스만 True
        """
        if not conditions:
            return []

        result = [True] * len(conditions[0])
        for cond in conditions:
            result = [r and c for r, c in zip(result, cond)]

        return result

    @staticmethod
    def or_condition(*conditions: list[bool]) -> list[bool]:
        """
        여러 조건의 OR

        Args:
            *conditions: 조건 리스트들

        Returns:
            하나 이상의 조건이 True인 인덱스 True
        """
        if not conditions:
            return []

        result = [False] * len(conditions[0])
        for cond in conditions:
            result = [r or c for r, c in zip(result, cond)]

        return result

    @staticmethod
    def stochastic_oversold(
        k_line: list[Optional[float]], threshold: float = 20
    ) -> list[bool]:
        """
        Stochastic 과매도 (%K < threshold)

        Args:
            k_line: Stochastic %K 값
            threshold: 임계값 (기본값: 20)

        Returns:
            조건 충족 여부
        """
        return [
            v is not None and v < threshold
            for v in k_line
        ]

    @staticmethod
    def stochastic_overbought(
        k_line: list[Optional[float]], threshold: float = 80
    ) -> list[bool]:
        """
        Stochastic 과매수 (%K > threshold)

        Args:
            k_line: Stochastic %K 값
            threshold: 임계값 (기본값: 80)

        Returns:
            조건 충족 여부
        """
        return [
            v is not None and v > threshold
            for v in k_line
        ]

    @staticmethod
    def bollinger_band_break_lower(
        close: list[float], bb_lower: list[Optional[float]]
    ) -> list[bool]:
        """
        종가가 볼린저 밴드 하단을 돌파

        Args:
            close: 종가 리스트
            bb_lower: 볼린저 밴드 하단

        Returns:
            조건 충족 여부
        """
        result = [False] * len(close)

        for i in range(1, len(close)):
            if (
                close[i] < bb_lower[i]
                and bb_lower[i] is not None
                and close[i - 1] >= bb_lower[i - 1]
                and bb_lower[i - 1] is not None
            ):
                result[i] = True

        return result

    @staticmethod
    def bollinger_band_break_upper(
        close: list[float], bb_upper: list[Optional[float]]
    ) -> list[bool]:
        """
        종가가 볼린저 밴드 상단을 돌파

        Args:
            close: 종가 리스트
            bb_upper: 볼린저 밴드 상단

        Returns:
            조건 충족 여부
        """
        result = [False] * len(close)

        for i in range(1, len(close)):
            if (
                close[i] > bb_upper[i]
                and bb_upper[i] is not None
                and close[i - 1] <= bb_upper[i - 1]
                and bb_upper[i - 1] is not None
            ):
                result[i] = True

        return result
