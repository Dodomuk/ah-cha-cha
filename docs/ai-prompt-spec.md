# AI 프롬프트 명세

**버전:** 2.0
**최종 수정:** 2026-06-04

---

## 1. 번역 프롬프트

### 목적
한국어 뉴스 기사 제목/요약을 영어로 번역

### 모델
- `claude-3-5-haiku-20241022`
- Max tokens: 1024

### 프롬프트

```
Translate the following Korean text to English. Return ONLY the translation, nothing else:

{original_text}
```

### 입력 예제

```
한국어로 많은 보안 기업들이 러시아 정부의 지원으로 국가 재정이 악화되었다고 보도했습니다.
```

### 출력 예제

```
Many security companies reported that Russia's national finances deteriorated with government support.
```

### 프롬프트 엔지니어링 노트

- **간결성**: "ONLY the translation"으로 부가 설명 방지
- **재시도**: 실패 시 최대 3회 재시도
- **에러 처리**: 번역 실패 시 원본 반환

---

## 2. 키워드 추출 (레거시)

### 목적
기사에서 주요 고유명사 추출

### 규칙

```python
# 3글자 이상 고유명사만
import re

def extract_keywords(text: str) -> list[str]:
    # 대문자로 시작하는 단어 추출
    pattern = r'\b[A-Z][a-z]{2,}\b'
    keywords = re.findall(pattern, text)
    return list(set(keywords))  # 중복 제거
```

### 입력 예제

```
"Russia and United States held talks about security. The summit was held in Geneva."
```

### 출력 예제

```
["Russia", "United States", "The", "Geneva"]
```

### 개선 사항

- "The", "And" 같은 조사/관사 제외
- 동일 변형 정규화 (Russia vs. Russian)
- 국가명 확인 (ISO 3166-1)

---

## 3. 카테고리 분류 (향후)

### 목적
뉴스 기사를 카테고리별로 자동 분류

### 예상 카테고리

```
- conflict: 국제 분쟁, 전쟁
- disaster: 재난, 자연재해
- cyber: 사이버 공격
- political: 정치 사건
- economic: 경제 뉴스
- health: 보건 사건
- general: 기타
```

### 프롬프트 (미구현)

```
Classify the following news article into ONE category:
conflict | disaster | cyber | political | economic | health | general

Article: {title} {summary}

Return ONLY the category name, nothing else.
```

---

## 4. 위협 수준 판정 (향후)

### 목적
기사의 영향도 기반 위협 수준 산정 (1-4)

### 판정 기준

```
1. 낮음: 일반 뉴스, 관심 수준
2. 중간: 지역 분쟁, 재난 (피해 제한적)
3. 높음: 다국가 영향, 사이버 공격
4. 매우 높음: 대규모 재해, 전면전, 감염병
```

### 프롬프트 (미구현)

```
Based on the article, assign a threat level from 1-4:

1 = Low impact general news
2 = Regional incident, limited impact
3 = Multi-country impact, cyberattack
4 = Major disaster, widespread impact

Article: {title} {summary}

Return ONLY a number (1-4), nothing else.
```

---

## 5. API 호출 구현

### Python 코드 (FastAPI)

```python
import anthropic
from app.config import settings

def translate_to_english(text: str) -> str:
    """한국어 텍스트를 영어로 번역"""
    if not text or not is_korean(text):
        return text
    
    try:
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        message = client.messages.create(
            model="claude-3-5-haiku-20241022",
            max_tokens=1024,
            messages=[{
                "role": "user",
                "content": f"Translate the following Korean text to English. "
                          f"Return ONLY the translation, nothing else:\n\n{text}"
            }]
        )
        return message.content[0].text.strip()
    except Exception as e:
        print(f"Translation error: {e}")
        return text

def is_korean(text: str) -> bool:
    """텍스트에 한국어가 포함되어 있는지 확인"""
    if not text:
        return False
    for char in text:
        if ord(char) >= 0xAC00 and ord(char) <= 0xD7A3:  # 한글 범위
            return True
    return False
```

### 성능 최적화

```python
from functools import lru_cache

@lru_cache(maxsize=1000)
def translate_to_english_cached(text: str) -> str:
    """번역 결과 캐싱"""
    return translate_to_english(text)
```

---

## 6. 비용 추정

### Haiku 모델 가격 (2026-06-04 기준)

| 항목 | 비용 |
|------|------|
| 입력 | $0.80 / 1M 토큰 |
| 출력 | $4.00 / 1M 토큰 |

### 일일 사용량 추정

- 기사당 평균 800 입력 토큰 + 100 출력 토큰
- 일일 50개 기사 수집 시:
  - 입력: 50 × 800 = 40,000 토큰
  - 출력: 50 × 100 = 5,000 토큰
  - 일일 비용: (40,000 × 0.8 + 5,000 × 4) / 1,000,000 = **$0.052**
  - 월 비용: **~$1.56**

---

## 7. 에러 처리

### 재시도 로직

```python
import time

def translate_with_retry(text: str, max_retries: int = 3) -> str:
    """실패 시 재시도"""
    for attempt in range(max_retries):
        try:
            return translate_to_english(text)
        except Exception as e:
            if attempt == max_retries - 1:
                print(f"Translation failed after {max_retries} attempts")
                return text
            time.sleep(2 ** attempt)  # 지수 백오프
```

---

## 8. 모니터링

### 번역 로그

```python
def translate_to_english_logged(text: str) -> str:
    result = translate_to_english(text)
    print(f"Translated: {text[:50]}... → {result[:50]}...")
    return result
```

### 메트릭 추적

```python
class TranslationMetrics:
    total_calls = 0
    total_tokens = 0
    errors = 0
    
    @classmethod
    def log_call(cls, input_tokens: int, output_tokens: int):
        cls.total_calls += 1
        cls.total_tokens += input_tokens + output_tokens
    
    @classmethod
    def log_error(cls):
        cls.errors += 1
```

---

## 9. 향후 개선사항

- [ ] 캐싱 통합 (Redis)
- [ ] 배치 번역 (10개 기사 동시 처리)
- [ ] 다국어 지원 (일본어, 중국어)
- [ ] 자동 카테고리 분류
- [ ] 위협 수준 자동 판정
- [ ] 감정 분석 (긍정/부정)
- [ ] 지역/국가 자동 추출

---

## 10. 참고 자료

- [Claude API 문서](https://docs.anthropic.com)
- [Haiku 모델 사양](https://docs.anthropic.com/en/docs/about/models/overview)
- [프롬프트 엔지니어링 가이드](https://docs.anthropic.com/en/docs/build-a-chatbot-with-claude)
