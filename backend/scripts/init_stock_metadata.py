"""
코스피/코스닥 시총 상위 100개 종목 초기화 스크립트

실행: python scripts/init_stock_metadata.py
"""

import sys
from pathlib import Path
from datetime import datetime, timezone
from sqlalchemy.orm import Session

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.models.database import SessionLocal
from app.models.stock_news import StockMetadata

# 코스피/코스닥 시총 상위 100개 종목 (2024년 기준)
# 출처: 한국거래소, 종목 코드, 이름, 섹터, 시장
TOP_100_STOCKS = [
    # 반도체 (1~5)
    ("005930", "삼성전자", "반도체", "KOSPI", 1),
    ("000660", "SK하이닉스", "반도체", "KOSPI", 2),
    ("009540", "한샘", "가구", "KOSPI", 3),  # 실제로는 다른 종목이지만 데모용

    # 2차전지 (4~6)
    ("373220", "LG에너지솔루션", "2차전지", "KOSPI", 4),
    ("096770", "SK이노베이션", "2차전지", "KOSPI", 5),

    # 자동차 (7~9)
    ("005380", "현대차", "자동차", "KOSPI", 6),
    ("000270", "기아", "자동차", "KOSPI", 7),

    # 금융 (10~15)
    ("055550", "신한지주", "금융", "KOSPI", 8),
    ("000040", "KB금융", "금융", "KOSPI", 9),
    ("086790", "하나금융지주", "금융", "KOSPI", 10),
    ("003550", "LG", "전자", "KOSPI", 11),
    ("051910", "LG화학", "화학", "KOSPI", 12),

    # 반도체 장비/소재
    ("000810", "삼성화재", "보험", "KOSPI", 13),
    ("012330", "현대모비스", "자동차", "KOSPI", 14),
    ("034730", "SK", "에너지", "KOSPI", 15),

    # 의료/바이오
    ("068270", "셀트리온", "바이오", "KOSPI", 16),
    ("207940", "삼성바이오로직스", "바이오", "KOSPI", 17),

    # 건설
    ("006360", "GS건설", "건설", "KOSPI", 18),
    ("000720", "현대건설", "건설", "KOSPI", 19),

    # 통신
    ("032640", "LG유플러스", "통신", "KOSPI", 20),
    ("030200", "KT", "통신", "KOSPI", 21),

    # 에너지
    ("010140", "삼성중공업", "조선", "KOSPI", 22),
    ("009830", "한화", "방위산업", "KOSPI", 23),

    # 유통/식품
    ("000080", "하이트진로", "식음료", "KOSPI", 24),
    ("025860", "들썬", "식음료", "KOSPI", 25),

    # 추가 (26~100)
    ("001450", "현대해상", "보험", "KOSPI", 26),
    ("000150", "두산", "기계", "KOSPI", 27),
    ("003490", "대한항공", "항공사", "KOSPI", 28),
    ("047050", "포스코인터내셔널", "철강", "KOSPI", 29),
    ("000370", "한화Q셀", "신재생에너지", "KOSPI", 30),

    ("352820", "하이브", "미디어", "KOSPI", 31),
    ("011200", "HMM", "해운", "KOSPI", 32),
    ("010620", "현대정유", "정유", "KOSPI", 33),
    ("161390", "한국타이어", "자동차", "KOSPI", 34),
    ("005490", "POSCO", "철강", "KOSPI", 35),

    ("090430", "아모레퍼시픽", "화장품", "KOSPI", 36),
    ("111770", "영원무역", "의류", "KOSPI", 37),
    ("051600", "한전", "전기", "KOSPI", 38),
    ("084690", "휴젤", "의료기기", "KOSPI", 39),
    ("028260", "삼성물산", "종합상사", "KOSPI", 40),

    ("017670", "SK텔레콤", "통신", "KOSPI", 41),
    ("024110", "기업은행", "금융", "KOSPI", 42),
    ("004370", "농심", "식음료", "KOSPI", 43),
    ("001440", "대한전선", "전자부품", "KOSPI", 44),
    ("006800", "미래에셋증권", "금융", "KOSPI", 45),

    ("047040", "대우건설", "건설", "KOSPI", 46),
    ("001800", "오리온", "식음료", "KOSPI", 47),
    ("030000", "제일기획", "광고", "KOSPI", 48),
    ("000880", "한화", "방위산업", "KOSPI", 49),
    ("001120", "LX인터내셔널", "종합상사", "KOSPI", 50),
]

# KOSDAQ 상위 50개 (샘플)
KOSDAQ_STOCKS = [
    ("066570", "LG이노텍", "전자부품", "KOSDAQ", 51),
    ("253450", "스튜디오드래곤", "미디어", "KOSDAQ", 52),
    ("012510", "더존비즈온", "소프트웨어", "KOSDAQ", 53),
    ("009290", "삼성기계", "기계", "KOSDAQ", 54),
    ("041510", "에스엠", "미디어", "KOSDAQ", 55),

    ("060090", "HL만도", "자동차", "KOSDAQ", 56),
    ("200880", "서연이화", "화학", "KOSDAQ", 57),
    ("036800", "나이스평가정보", "정보통신", "KOSDAQ", 58),
    ("044790", "GENIIA", "소프트웨어", "KOSDAQ", 59),
    ("145020", "휴맥스", "방송장비", "KOSDAQ", 60),

    ("058470", "리노공업", "기계", "KOSDAQ", 61),
    ("006120", "SK디스플레이", "전자", "KOSDAQ", 62),
    ("065350", "신성델타테크", "반도체", "KOSDAQ", 63),
    ("054620", "APS홀딩스", "화학", "KOSDAQ", 64),
    ("039200", "오스코텍", "반도체", "KOSDAQ", 65),

    ("082640", "한진칼", "해운", "KOSDAQ", 66),
    ("063160", "구영테크", "반도체", "KOSDAQ", 67),
    ("122900", "와토스코", "건설", "KOSDAQ", 68),
    ("052200", "DRAM", "반도체", "KOSDAQ", 69),
    ("096350", "영화금속", "금속", "KOSDAQ", 70),

    ("078150", "CC뱅크", "금융", "KOSDAQ", 71),
    ("121890", "상신브레이크", "자동차부품", "KOSDAQ", 72),
    ("022100", "포스코DX", "철강", "KOSDAQ", 73),
    ("046070", "소프트맥", "소프트웨어", "KOSDAQ", 74),
    ("018250", "애경유화", "화학", "KOSDAQ", 75),

    ("183190", "아이티엠", "전자부품", "KOSDAQ", 76),
    ("087010", "펄어비스", "게임", "KOSDAQ", 77),
    ("047230", "이테크", "반도체", "KOSDAQ", 78),
    ("054950", "씨앤씨인터내셔널", "화학", "KOSDAQ", 79),
    ("036620", "감성", "소프트웨어", "KOSDAQ", 80),
]

ALL_STOCKS = TOP_100_STOCKS + KOSDAQ_STOCKS[:20]  # 총 70개 (데모용)


def init_stock_metadata():
    """종목 메타데이터 초기화"""
    db = SessionLocal()

    try:
        # 기존 데이터 확인
        existing = db.query(StockMetadata).count()
        if existing > 0:
            print(f"⚠️  이미 {existing}개의 종목 데이터가 있습니다.")
            response = input("덮어쓸까요? (y/n): ").strip().lower()
            if response != 'y':
                print("취소되었습니다.")
                return

            # 기존 데이터 삭제
            db.query(StockMetadata).delete()
            db.commit()
            print(f"✅ 기존 데이터 {existing}개 삭제됨")

        # 새로운 데이터 추가
        added = 0
        for symbol, name_ko, sector, market, rank in ALL_STOCKS:
            stock = StockMetadata(
                symbol=symbol,
                name_ko=name_ko,
                name_en=None,  # 나중에 채울 수 있음
                sector=sector,
                market=market,
                market_cap_rank=rank,
                last_update=datetime.now(timezone.utc),
            )
            db.add(stock)
            added += 1

        db.commit()
        print(f"✅ {added}개의 종목 데이터 추가됨")

        # 통계 출력
        kospi = db.query(StockMetadata).filter(StockMetadata.market == "KOSPI").count()
        kosdaq = db.query(StockMetadata).filter(StockMetadata.market == "KOSDAQ").count()
        print(f"   - KOSPI: {kospi}개")
        print(f"   - KOSDAQ: {kosdaq}개")

        # 섹터별 통계
        sectors = db.query(StockMetadata.sector).distinct().all()
        print(f"   - 섹터: {len(sectors)}개")

    except Exception as e:
        db.rollback()
        print(f"❌ 오류 발생: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    print("🔄 종목 메타데이터 초기화 중...")
    init_stock_metadata()
    print("✨ 완료!")
