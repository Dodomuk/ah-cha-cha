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

## 4. 뉴스 수집 및 요약 (2단계)

### 4-1. RSS 수집 (API 크래딧 소모 없음)
```bash
curl -s -X POST http://localhost:8000/api/internal/collect \
  -H "X-Internal-Key: dev-internal-key"
```
→ 새 기사를 DB에 저장 (ai_processed=False 상태)

### 4-2. 대기 중인 기사 수 확인
```bash
curl -s http://localhost:8000/api/news/pending-count \
  -H "X-Internal-Key: dev-internal-key"
```

### 4-3. AI 요약 실행 (⚠️ Claude API 크래딧 소모)
```bash
curl -s -X POST http://localhost:8000/api/internal/summarize \
  -H "X-Internal-Key: dev-internal-key"
```
→ 요약 완료 후 `backend/logs/api_usage.log` 에 토큰/비용 기록됨

---

## 5. API 사용량 확인

```bash
cat ~/Desktop/GIT/ah-cha-cha/backend/logs/api_usage.log
```

출력 예시:
```json
{"date": "2026-05-24 06:00 UTC", "pending": 15, "summarized": 14, "input_tokens": 52000, "output_tokens": 7000, "cost_usd": 0.0698}
```

---

## 6. 종료

```bash
# 백엔드/프론트엔드: 각 터미널에서 Ctrl+C
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

## 현재 운영 모드 (TEST_MODE=true)

| 동작 | 자동/수동 |
|---|---|
| RSS 수집 (매일 06:00 KST) | 자동 |
| AI 요약 (Claude Haiku) | **수동** — 4-3 명령어 실행 필요 |

> TEST_MODE 해제 시: `.env`에서 `TEST_MODE=false` → 수집과 요약이 자동으로 함께 실행
