# 백테스터 기능 구현 계획

## 1. 아키텍처 개요

### 1.1 데이터 플로우

```
[UI: 종목/조건 선택]
  ↓
[FastAPI: /api/backtest 엔드포인트]
  ↓
[백테스트 엔진: 과거 데이터 기반 매매 시뮬레이션]
  ↓
[성과 계산: 수익률, MDD, Sharpe Ratio 등]
  ↓
[응답: 차트 데이터 + 지표 + 매매 기록]
  ↓
[Next.js: Chart.js로 시각화]
  ↓
[사용자]
```

### 1.2 핵심 컴포넌트

| 컴포넌트 | 역할 | 위치 |
|---------|------|------|
| 데이터 수집 스케줄러 | 매일 주식 데이터 수집 (장 마감 후) | backend/app/scheduler/stock_data.py |
| 백테스트 엔진 | 조건 기반 매매 시뮬레이션 | backend/app/services/backtester.py |
| 신호 생성기 | 이동평균, RSI 등 지표 계산 + 신호 | backend/app/services/signals.py |
| API 라우터 | 백테스트 요청/응답 | backend/app/api/backtest_routes.py |
| 프론트엔드 UI | 조건 입력 폼 + 차트 | frontend/app/backtester/page.tsx |

---

## 2. 데이터베이스 스키마

### 2.1 stock_daily (일일 주가 데이터)

```sql
CREATE TABLE stock_daily (
  id BIGSERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,      -- "005930" (삼성전자)
  date DATE NOT NULL,                -- "2024-01-15"
  open DECIMAL(10, 2),              -- 시가
  high DECIMAL(10, 2),              -- 고가
  low DECIMAL(10, 2),               -- 저가
  close DECIMAL(10, 2),             -- 종가
  volume BIGINT,                     -- 거래량
  adj_close DECIMAL(10, 2),         -- 수정 종가
  
  -- 이동평균 (캐시)
  ma5 DECIMAL(10, 2),
  ma20 DECIMAL(10, 2),
  ma60 DECIMAL(10, 2),
  
  -- RSI, MACD (캐시)
  rsi14 DECIMAL(5, 2),
  macd DECIMAL(10, 4),
  macd_signal DECIMAL(10, 4),
  
  UNIQUE(symbol, date),
  INDEX idx_symbol_date (symbol, date)
);
```

### 2.2 stock_metadata (종목 정보)

```sql
CREATE TABLE stock_metadata (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,        -- "삼성전자"
  sector VARCHAR(50),                -- "반도체"
  market VARCHAR(20),                -- "KOSPI" or "KOSDAQ"
  last_update TIMESTAMP
);
```

---

## 3. 백테스트 엔진 구현

### 3.1 신호 생성기 (backend/app/services/signals.py)

**역할**: 기술적 지표 계산 및 매매 신호 생성

```python
class SignalGenerator:
    """기술적 지표 계산 및 매매 신호 생성"""
    
    def calculate_ma(self, prices: list, window: int) -> list:
        """단순 이동평균"""
        
    def calculate_rsi(self, prices: list, period: int = 14) -> list:
        """RSI (상대강도지수)"""
        
    def calculate_macd(self, prices: list) -> tuple:
        """MACD 지표"""
        
    def generate_signals(self, data: DataFrame, conditions: dict) -> list:
        """
        조건에 따라 매매 신호 생성
        
        조건 형식:
        {
            "type": "crossing",  # crossing, above, below, etc.
            "indicator": "sma",  # sma, rsi, macd, etc.
            "params": {
                "window1": 5,    # 5일선
                "window2": 20    # 20일선
            }
        }
        """
```

### 3.2 백테스트 엔진 (backend/app/services/backtester.py)

**역할**: 과거 데이터 기반 매매 시뮬레이션

```python
class Backtester:
    """백테스트 실행 엔진"""
    
    def run(self, 
            symbol: str,
            start_date: str,      # "2022-01-01"
            end_date: str,        # "2024-12-31"
            conditions: list,     # [조건1, 조건2, ...]
            initial_cash: float = 1000000
            ) -> BacktestResult:
        """
        백테스트 실행
        
        Returns:
        - trades: 모든 매매 기록 (날짜, 수익률, 비고)
        - equity_curve: 일일 자산 변화
        - metrics: 수익률, MDD, Sharpe Ratio, Win Rate 등
        - buy_signals: 매수 신호 위치 (차트 표시용)
        - sell_signals: 매도 신호 위치
        """
        
    def calculate_metrics(self, equity_curve: list, trades: list) -> dict:
        """성과 지표 계산"""
        return {
            "total_return": float,       # 총 수익률 (%)
            "annual_return": float,      # 연환산 수익률
            "max_drawdown": float,       # MDD (%)
            "sharpe_ratio": float,       # Sharpe Ratio
            "sortino_ratio": float,      # Sortino Ratio
            "win_rate": float,           # 승률 (%)
            "profit_factor": float,      # 수익/손실 비율
            "trades_count": int,         # 총 거래 횟수
        }
```

### 3.3 조건 빌더 (backend/app/services/condition_builder.py)

**역할**: UI에서 받은 조건을 신호 생성에 사용할 수 있는 형식으로 변환

```python
class ConditionBuilder:
    """UI 조건 → 신호 생성 형식 변환"""
    
    def parse_conditions(self, ui_conditions: list) -> list:
        """
        입력 형식:
        [
            {
                "type": "moving_average_cross",
                "short_window": 5,
                "long_window": 20,
                "signal": "buy"  # buy 신호
            },
            {
                "type": "rsi",
                "period": 14,
                "level": 30,
                "operator": "<",  # RSI < 30
                "signal": "buy"
            }
        ]
        
        출력: 신호 생성기가 이해할 수 있는 형식
        """
```

---

## 4. API 설계 (FastAPI)

### 4.1 POST /api/backtest

**요청:**
```json
{
  "symbol": "005930",
  "start_date": "2022-01-01",
  "end_date": "2024-12-31",
  "conditions": [
    {
      "type": "moving_average_cross",
      "short_window": 5,
      "long_window": 20
    },
    {
      "type": "rsi",
      "period": 14,
      "level": 30,
      "operator": "<"
    }
  ],
  "position_size": 1000000
}
```

**응답:**
```json
{
  "success": true,
  "symbol": "005930",
  "name": "삼성전자",
  "period": "2022-01-01 ~ 2024-12-31",
  "metrics": {
    "total_return": 45.2,
    "annual_return": 12.5,
    "max_drawdown": -12.3,
    "sharpe_ratio": 0.85,
    "win_rate": 58.3,
    "profit_factor": 1.45,
    "trades_count": 23
  },
  "equity_curve": [
    {"date": "2022-01-03", "equity": 1000000, "return": 0},
    {"date": "2022-01-04", "equity": 998500, "return": -0.15},
    ...
  ],
  "trades": [
    {
      "date": "2022-01-10",
      "type": "BUY",
      "price": 75000,
      "quantity": 13,
      "value": 975000
    },
    {
      "date": "2022-02-15",
      "type": "SELL",
      "price": 77000,
      "quantity": 13,
      "value": 1001000,
      "return": 2.67
    }
  ],
  "signals": {
    "buy": [
      {"date": "2022-01-10", "price": 75000},
      ...
    ],
    "sell": [
      {"date": "2022-02-15", "price": 77000},
      ...
    ]
  }
}
```

### 4.2 GET /api/stocks

종목 검색/리스트 조회

**응답:**
```json
{
  "stocks": [
    {"symbol": "005930", "name": "삼성전자", "sector": "반도체", "market": "KOSPI"},
    {"symbol": "000270", "name": "기아", "sector": "자동차", "market": "KOSPI"},
    ...
  ]
}
```

### 4.3 GET /api/stocks/{symbol}/data

종목의 최신 주가 데이터

**응답:**
```json
{
  "symbol": "005930",
  "latest_date": "2024-12-31",
  "data": [
    {"date": "2024-12-20", "open": 75000, "close": 75500, "volume": 10000000},
    ...
  ]
}
```

---

## 5. 프론트엔드 UI 구현

### 5.1 페이지 구조 (frontend/app/backtester/page.tsx)

```
┌─────────────────────────────────────────────────────────┐
│                      백테스터                              │
├──────────────────┬──────────────────────────────────────┤
│                  │                                       │
│  [설정 패널]      │           [차트 영역]                │
│                  │                                       │
│  • 종목 검색      │    - 주가 차트                       │
│  • 조건 빌더      │    - 매매 신호 표시 (buy/sell)     │
│  • 기간 선택      │    - 기술적 지표 오버레이           │
│  • 백테스트 실행  │                                       │
│  • [실행 버튼]    │                                       │
└──────────────────┴──────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│                    성과 지표                              │
├─────────────────┬──────────────┬──────────────┐          │
│ 총수익률: +45.2% │ MDD: -12.3%  │ 승률: 58.3% │ ...     │
├─────────────────┴──────────────┴──────────────┘          │
│ Sharpe: 0.85 | Win/Loss: 1.45 | 거래: 23회           │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│               매매 기록 (표 형식)                         │
├────────┬────────┬────────┬────────┬──────────┐          │
│ 날짜   │ 유형   │ 가격   │ 수량   │ 수익률   │          │
├────────┼────────┼────────┼────────┼──────────┤          │
│ 2022-01-10 │ BUY │ 75000 │ 13 │ - │      │
│ 2022-02-15 │ SELL │ 77000 │ 13 │ +2.67% │      │
└────────┴────────┴────────┴────────┴──────────┘          │
```

### 5.2 조건 빌더 UI (컴포넌트)

```tsx
// ConditionBuilder.tsx
- 조건 추가 버튼
- 각 조건마다:
  - 지표 선택 드롭다운 (이동평균, RSI, MACD 등)
  - 파라미터 입력 (window, level 등)
  - AND/OR 로직 선택
  - 삭제 버튼
```

---

## 6. 데이터 수집 스케줄러

### 6.1 주식 데이터 수집 (backend/app/scheduler/stock_data.py)

```python
def collect_stock_data():
    """
    매일 장 마감 후 (16:00) 실행
    - yfinance로 한국 주식 데이터 수집
    - FinanceDataReader로 코스피/코스닥 상위 100개 기본 정보
    - DB에 저장
    - 이동평균, RSI, MACD 캐싱 (선택)
    """
```

### 6.2 스케줄 설정

```python
# backend/app/scheduler/jobs.py
scheduler.add_job(
    collect_stock_data,
    'cron',
    hour=16,
    minute=0,
    timezone='Asia/Seoul'
)
```

---

## 7. 개발 단계

### Phase 1: 기본 백테스터 (1주)
- [ ] DB 스키마 생성 (stock_daily, stock_metadata)
- [ ] 데이터 수집 스케줄러 (yfinance)
- [ ] 신호 생성기 (이동평균)
- [ ] 백테스트 엔진 기본 구현
- [ ] API 엔드포인트 (/api/backtest)
- [ ] 프론트엔드: 조건 입력 폼 + 차트 렌더링

### Phase 2: 지표 확장 (3일)
- [ ] RSI, MACD 신호 생성
- [ ] 볼린저 밴드
- [ ] Stochastic

### Phase 3: 성과 계산 개선 (2일)
- [ ] 수익률, MDD, Sharpe Ratio 정확성 검증
- [ ] 매매 기록 상세 정보 추가

### Phase 4: UI/UX 개선 (3일)
- [ ] 차트 인터랙션 (줌, 패닝)
- [ ] 반응형 디자인
- [ ] 성과 지표 상세 설명 (툴팁)

---

## 8. 테스트 전략

### 8.1 백테스터 검증
- 단순 이동평균 크로스오버: 수작업으로 계산한 결과와 비교
- 수익률 계산: 엑셀과 결과 일치 확인
- MDD 계산: 실제 그래프와 일치 확인

### 8.2 API 테스트
- POST /api/backtest: 정상 요청 → 응답 구조 검증
- 에러 처리: 잘못된 심볼, 날짜 범위 등

---

## 9. 배포 전 체크리스트

- [ ] 데이터 수집 3일 이상 정상 작동 확인
- [ ] 백테스트 결과 정확성 수동 검증
- [ ] API 성능: 백테스트 평균 응답시간 < 3초
- [ ] 프론트엔드: 반응형 디자인 확인 (데스크탑, 태블릿)
- [ ] 에러 처리: 사용자 피드백 메시지 정상 표시

