"""
백테스터 테스트 스크립트

실행: python scripts/test_backtester.py
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.models.database import SessionLocal
from app.services.backtester import Backtester

def test_backtest():
    """백테스트 기본 테스트"""
    db = SessionLocal()

    try:
        backtester = Backtester(db)

        # 테스트 케이스 1: 이동평균 크로스오버
        print("=" * 60)
        print("테스트 1: 이동평균 크로스오버 (5일선 > 20일선)")
        print("=" * 60)

        result = backtester.run(
            symbol="005930",  # 삼성전자
            start_date="2024-01-01",
            end_date="2024-12-31",
            conditions=[
                {
                    "type": "ma_cross_above",
                    "short_window": 5,
                    "long_window": 20,
                }
            ],
            initial_cash=1_000_000,
        )

        print(f"\n📊 백테스트 결과")
        print(f"종목: {result.symbol} ({result.name})")
        print(f"기간: {result.period}")
        print()

        print(f"📈 성과 지표")
        print(f"  총 수익률: {result.metrics['total_return']}%")
        print(f"  연환산 수익률: {result.metrics['annual_return']}%")
        print(f"  최대낙폭 (MDD): {result.metrics['max_drawdown']}%")
        print(f"  Sharpe Ratio: {result.metrics['sharpe_ratio']}")
        print()

        print(f"💹 거래 지표")
        print(f"  총 거래: {result.metrics['trades_count']}회")
        print(f"  승률: {result.metrics['win_rate']}%")
        print(f"  평균 수익: {result.metrics['avg_win']}%")
        print(f"  평균 손실: {result.metrics['avg_loss']}%")
        print(f"  프로핏 팩터: {result.metrics['profit_factor']}")
        print()

        print(f"📋 매매 기록 (처음 5건)")
        for i, trade in enumerate(result.trades[:5]):
            print(f"  {i+1}. {trade.date} | {trade.trade_type:4} | "
                  f"가격: {trade.price:,} | 수량: {trade.quantity:5} | "
                  f"수익률: {trade.return_pct if trade.return_pct else '-'}%")
        print()

        # 테스트 케이스 2: RSI 과매도
        print("=" * 60)
        print("테스트 2: RSI 과매도 (RSI < 30)")
        print("=" * 60)

        result2 = backtester.run(
            symbol="005930",
            start_date="2024-01-01",
            end_date="2024-12-31",
            conditions=[
                {
                    "type": "rsi_below",
                    "level": 30,
                }
            ],
            initial_cash=1_000_000,
        )

        print(f"\n📊 백테스트 결과")
        print(f"종목: {result2.symbol} ({result2.name})")
        print()

        print(f"📈 성과 지표")
        print(f"  총 수익률: {result2.metrics['total_return']}%")
        print(f"  최대낙폭: {result2.metrics['max_drawdown']}%")
        print(f"  총 거래: {result2.metrics['trades_count']}회")
        print(f"  승률: {result2.metrics['win_rate']}%")
        print()

        # 자산 곡선 샘플
        print(f"💰 자산 변화 (10개 포인트)")
        step = len(result.equity_curve) // 10
        for i in range(0, len(result.equity_curve), step):
            point = result.equity_curve[i]
            print(f"  {point['date']} | "
                  f"자산: {point['equity']:,.0f} | "
                  f"수익률: {point['return']:+.2f}%")

        print()
        print("✅ 테스트 완료!")

    except Exception as e:
        print(f"❌ 에러: {e}")
        import traceback
        traceback.print_exc()

    finally:
        db.close()


if __name__ == "__main__":
    test_backtest()
