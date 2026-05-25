# 아차차 로컬 개발 시작 가이드

## 사전 준비
- Docker Desktop 실행 상태 확인
- `backend/.env` 파일 존재 확인 (없으면 `.env.example` 복사 후 키 입력)

---

## 1. DB 시작 (Docker)

```bash
cd ~/Desktop/GIT/ah-cha-cha
docker compose up -d db
```

> 최초 1회만: DB 마이그레이션
> ```bash
> cd backend && source .venv/bin/activate
> alembic upgrade head
> ```

---

## 2. 백엔드 시작

```bash
cd ~/Desktop/GIT/ah-cha-cha/backend
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

확인: http://localhost:8000/health

---

## 3. 프론트엔드 시작 (새 터미널)

```bash
cd ~/Desktop/GIT/ah-cha-cha/frontend
npm run dev
```

확인: http://localhost:3000

---

## 4. 뉴스 수집 수동 트리거

```bash
curl -s -X POST http://localhost:8000/api/internal/collect \
  -H "X-Internal-Key: dev-internal-key"
```

수집 결과 확인:
```bash
curl -s "http://localhost:8000/api/news/latest?min_level=1&limit=5" | python3 -m json.tool
```

---

## 5. 종료

```bash
# 백엔드: 실행 중인 터미널에서 Ctrl+C
# 프론트엔드: 실행 중인 터미널에서 Ctrl+C

# Docker DB 종료
cd ~/Desktop/GIT/ah-cha-cha
docker compose down
```

---

## 주요 포트

| 서비스 | 포트 |
|---|---|
| 프론트엔드 (Next.js) | 3000 |
| 백엔드 (FastAPI) | 8000 |
| DB (PostgreSQL) | 5432 |

---

## 현재 상태 (2026-05-23 기준)

- RSS 수집: 정상 동작 (TheHackerNews, BleepingComputer, KrebsOnSecurity, DarkReading)
- AI 요약 (Claude Haiku): **API 크래딧 필요** — console.anthropic.com/settings/billing 에서 충전
- 크래딧 충전 후 수집 트리거하면 위협 레벨 지도 색상 활성화됨
