# 로컬 개발 시작 가이드

**최종 수정:** 2026-06-04

---

## 1. 사전 요구사항

- **Node.js 18+**
  ```bash
  node --version  # v18.0.0 이상
  ```

- **Python 3.9+**
  ```bash
  python3 --version  # 3.9 이상
  ```

- **Docker Desktop** (선택사항, PostgreSQL 로컬 실행용)

- **Git**
  ```bash
  git --version
  ```

- **API 키**
  - Anthropic Claude API 키 (https://console.anthropic.com)
  - Supabase 계정 또는 로컬 PostgreSQL

---

## 2. 저장소 클론

```bash
git clone https://github.com/Dodomuk/ah-cha-cha.git
cd ah-cha-cha
```

---

## 3. 백엔드 설정

### 3-1. 환경 변수

```bash
cd backend
cp .env.example .env
```

`backend/.env` 작성:
```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ahchacha

# API Keys
ANTHROPIC_API_KEY=sk-ant-v7-xxxxx  # https://console.anthropic.com에서 생성

# CORS (로컬 개발)
CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000"]

# 개발 모드
DEBUG=true
```

### 3-2. 데이터베이스 (3가지 옵션)

#### 옵션 A: Docker로 PostgreSQL 실행 (권장)

```bash
docker run -d \
  --name ahchacha-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=ahchacha \
  -p 5432:5432 \
  postgres:15
```

#### 옵션 B: Supabase 사용

1. https://supabase.com에서 계정 생성
2. 새 프로젝트 생성
3. "Connection Pooler" URI 복사
4. `.env`에 `DATABASE_URL` 설정:
   ```env
   DATABASE_URL=postgresql://postgres:xxx@zzz.supabase.co:6543/postgres?sslmode=require
   ```

#### 옵션 C: 로컬 PostgreSQL

```bash
# macOS (Homebrew)
brew install postgresql
brew services start postgresql
psql postgres -c "CREATE DATABASE ahchacha;"
```

### 3-3. 패키지 설치

```bash
cd backend
pip install -r requirements.txt
```

### 3-4. 서버 시작

```bash
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

✅ http://localhost:8000/health 접속해서 OK 응답 확인

---

## 4. 프론트엔드 설정

### 4-1. 환경 변수

```bash
cd frontend
cat > .env.local << EOF
NEXT_PUBLIC_API_URL=http://localhost:8000
EOF
```

### 4-2. 패키지 설치

```bash
npm install
```

### 4-3. 개발 서버 시작

```bash
npm run dev
```

✅ http://localhost:3000 접속

---

## 5. 테스트

### 백엔드 API 테스트

```bash
# 헬스 체크
curl http://localhost:8000/health

# 속보 조회 (초기 데이터 없음)
curl http://localhost:8000/api/events?limit=5

# WebSocket 테스트 (wscat 설치 필요)
npm install -g wscat
wscat -c ws://localhost:8000/ws
```

### 프론트엔드 테스트

1. 브라우저 http://localhost:3000 접속
2. 콘솔 열기 (F12)
3. "이벤트가 없습니다" 메시지 확인
4. API 연결 상태 확인

---

## 6. 더미 데이터 추가 (선택)

데이터베이스에 테스트 기사 추가:

```python
# backend/seed_data.py
import psycopg2
from datetime import datetime, timedelta

conn = psycopg2.connect(
    dbname="ahchacha",
    user="postgres",
    password="postgres",
    host="localhost"
)

cur = conn.cursor()

articles = [
    ("Breaking News Title 1", "Summary of the breaking news event 1", "conflict", 2, ["US", "RU"]),
    ("Major Disaster Reported", "A significant disaster has occurred affecting multiple nations", "disaster", 3, ["JP"]),
    ("Cyber Attack Alert", "Critical infrastructure targeted in coordinated attack", "cyber", 4, ["DE", "FR"]),
]

for title, summary, category, level, countries in articles:
    cur.execute(
        """
        INSERT INTO news_articles 
        (title, summary, category, threat_level, country_codes, collected_at, ai_processed)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (title, summary, category, level, countries, datetime.utcnow(), True)
    )

conn.commit()
cur.close()
conn.close()

print("✅ 더미 데이터 추가 완료")
```

```bash
python backend/seed_data.py
```

---

## 7. 개발 워크플로우

### 커밋 전 체크리스트

```bash
# 프론트엔드 빌드 확인
cd frontend
npm run build

# 린트 체크
npm run lint

# 백엔드 테스트
cd ../backend
python -m pytest

# 커밋
git add .
git commit -m "feat: 기능 설명"
```

### 브랜치 전략

```
main (프로덕션)
  ↑
develop (스테이징)
  ↑
feature/기능명 (기능 개발)
```

```bash
# 새 기능 시작
git checkout -b feature/새기능
# ... 개발 ...
git push origin feature/새기능
# PR 생성 → 코드 리뷰 → 병합
```

---

## 8. 트러블슈팅

### DB 연결 오류

```
Error: could not connect to server: Connection refused
```

**해결:**
```bash
# Docker 확인
docker ps | grep ahchacha-db

# 없으면 다시 시작
docker run -d --name ahchacha-db ... (위의 docker run 명령 참고)
```

### CORS 오류

```
Access to XMLHttpRequest blocked by CORS policy
```

**해결:** `.env`의 `CORS_ORIGINS`에 프론트엔드 URL 추가

```env
CORS_ORIGINS=["http://localhost:3000"]
```

### API 키 오류

```
AuthenticationError: Invalid API key
```

**해결:** https://console.anthropic.com에서 유효한 API 키 생성 후 `.env` 업데이트

### 포트 충돌

```
Address already in use
```

**해결:**
```bash
# macOS/Linux
lsof -i :8000  # 포트 8000 사용 중인 프로세스 찾기
kill -9 <PID>  # 종료

# 또는 다른 포트 사용
uvicorn app.main:app --port 8001
```

---

## 9. VSCode 디버깅

`.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "FastAPI",
      "type": "python",
      "request": "launch",
      "module": "uvicorn",
      "args": ["app.main:app", "--reload"],
      "jinja": true,
      "cwd": "${workspaceFolder}/backend"
    },
    {
      "name": "Next.js",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}/frontend",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "console": "integratedTerminal"
    }
  ]
}
```

F5로 디버깅 시작

---

## 10. 배포 전 체크리스트

```bash
# 1. 모든 변경사항 커밋
git status  # 깨끗해야 함

# 2. 프로덕션 빌드 테스트
npm run build

# 3. 환경 변수 확인 (Render, Vercel)
# - DATABASE_URL
# - ANTHROPIC_API_KEY
# - NEXT_PUBLIC_API_URL

# 4. 마지막 커밋 확인
git log -1

# 5. 푸시
git push origin main
```

배포는 GitHub 연동으로 자동 진행됨 (Vercel, Render)
