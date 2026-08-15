-- 아차차 초기 스키마
--
-- 🚨 저장 정책 (Sprint 3 착수 시 확정)
--    검사한 주소는 사용자가 문자로 받은 링크다. 개인적인 맥락이 실린다.
--    그래서 **위험한 것만 원문을 남긴다**:
--      - danger / caution  → 정규화 URL·체인·설명까지 보관. 신고 처리, 관리자 검토,
--                            이의제기 대응에 실제로 필요하다
--      - no_signal / unknown → url_hash 와 판정만. 무엇을 검사했는지 알 수 없다
--
--    전체 결과 캐시는 Postgres가 아니라 Redis(6시간 TTL)가 맡는다.
--    자동으로 사라지므로 깨끗한 검사도 담을 수 있다.
--
--    이 규칙을 어기고 clean 검사에 원문을 넣기 시작하면, 개인정보처리방침에
--    적어둔 내용과 실제 동작이 어긋난다. 방침을 먼저 고칠 것.

create extension if not exists "pgcrypto";

-- ── 도메인 단위 집계 ────────────────────────────────────────────────
-- 신고가 쌓이거나 위험 판정을 받은 도메인만 행이 생긴다.
-- 깨끗한 사이트를 검사했다는 이유만으로 행을 만들지 않는다.
create table domains (
  id              uuid primary key default gen_random_uuid(),
  domain          text not null unique,          -- 등록가능 도메인 (example.co.kr)
  first_seen      timestamptz not null default now(),
  registered_at   timestamptz,                   -- RDAP 조회 결과
  current_verdict text check (
    current_verdict in ('danger', 'caution', 'unknown', 'no_signal')
  ),
  -- 🚨 판정과 분리해서 표시해야 하는 값. 자동 판정에 절대 반영하지 않는다
  report_count    integer not null default 0,
  admin_reviewed_at timestamptz,
  appeal_status   text not null default 'none' check (
    appeal_status in ('none', 'open', 'accepted', 'rejected')
  ),
  updated_at      timestamptz not null default now()
);

create index domains_report_count_idx on domains (report_count desc)
  where report_count > 0;
create index domains_review_queue_idx on domains (first_seen)
  where admin_reviewed_at is null and report_count > 0;

-- ── 검사 이력 ──────────────────────────────────────────────────────
create table scans (
  id             uuid primary key default gen_random_uuid(),
  -- 정규화된 URL의 SHA-256. 원문 없이도 같은 주소인지 알 수 있다
  url_hash       char(64) not null,
  domain_id      uuid references domains (id) on delete set null,
  verdict        text not null check (
    verdict in ('danger', 'caution', 'unknown', 'no_signal')
  ),

  -- ↓ 여기부터는 danger / caution 일 때만 채운다 (아래 제약으로 강제)
  normalized_url text,
  final_url      text,
  signals        jsonb,
  redirect_chain jsonb,
  llm_explanation jsonb,

  scanned_at     timestamptz not null default now(),
  expires_at     timestamptz not null,

  -- 정책을 주석이 아니라 DB가 강제한다. 코드가 실수해도 원문이 새지 않는다
  constraint scans_plaintext_only_when_risky check (
    verdict in ('danger', 'caution')
    or (
      normalized_url is null
      and final_url is null
      and redirect_chain is null
    )
  )
);

create index scans_url_hash_idx on scans (url_hash, scanned_at desc);
create index scans_domain_idx on scans (domain_id, scanned_at desc);

-- ── 공유 링크 ──────────────────────────────────────────────────────
-- 사용자가 "공유하기"를 누른 순간에만 만들어진다.
-- 깨끗한 결과도 공유할 수 있어야 하는데, 그 시점엔 저장에 동의한 것이므로
-- scans의 원문 제약과 별개로 결과 전체를 담아둔다.
create table shared_results (
  short_id    text primary key,                  -- URL에 노출되는 짧은 식별자
  verdict     text not null,
  -- 화면에 보여줄 최소한만. 원본 주소는 마스킹된 형태로만 담는다
  masked_domain text not null,
  headline    text not null,
  reasons     jsonb not null,
  scanned_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  view_count  integer not null default 0
);

create index shared_results_expiry_idx on shared_results (expires_at);

-- ── 사용자 신고 ────────────────────────────────────────────────────
create table reports (
  id            uuid primary key default gen_random_uuid(),
  domain_id     uuid not null references domains (id) on delete cascade,
  category      text not null check (
    category in (
      'phishing',        -- 피싱/가짜사이트
      'malware_app',     -- 악성앱 설치 유도
      'scam_shop',       -- 사기 쇼핑몰
      'gambling',        -- 도박/불법
      'spam',            -- 스팸
      'false_positive'   -- 오탐 신고 (안전한데 위험으로 나옴)
    )
  ),
  description   text check (char_length(description) <= 200),
  -- 원본 IP를 저장하지 않는다. 같은 사람의 중복 신고만 걸러내면 된다
  reporter_ip_hash char(64) not null,
  review_status text not null default 'pending' check (
    review_status in ('pending', 'accepted', 'rejected', 'duplicate')
  ),
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz
);

create index reports_queue_idx on reports (created_at)
  where review_status = 'pending';
-- 같은 사람이 같은 도메인을 반복 신고해 카운트를 부풀리지 못하게 한다
create unique index reports_dedupe_idx on reports (domain_id, reporter_ip_hash);

-- 신고가 들어오면 도메인의 누적 건수를 올린다.
-- 애플리케이션에서 select-후-update로 하면 동시 신고가 겹칠 때 카운트가 새므로
-- 트리거로 원자적으로 처리한다.
--
-- 🚨 오탐 신고(false_positive)는 세지 않는다. report_count는 "이 사이트가
--    위험하다는 신고 수"인데, 오탐 신고는 정반대 주장이다. 같이 세면
--    "안전하다고 신고한 사람" 때문에 위험해 보이는 역전이 일어난다.
create function bump_report_count() returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if new.category <> 'false_positive' then
    update domains
       set report_count = report_count + 1,
           updated_at = now()
     where id = new.domain_id;
  end if;
  return new;
end;
$$;

create trigger reports_bump_count
  after insert on reports
  for each row execute function bump_report_count();

-- ── 이의제기 ───────────────────────────────────────────────────────
-- 사이트 운영자가 삭제·정정을 요청하는 창구. 신고 기능과 같은 날 열려 있어야 한다
create table appeals (
  id         uuid primary key default gen_random_uuid(),
  domain_id  uuid not null references domains (id) on delete cascade,
  contact    text not null,                      -- 회신받을 이메일
  claim      text not null,
  status     text not null default 'open' check (
    status in ('open', 'accepted', 'rejected')
  ),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_note text
);

create index appeals_open_idx on appeals (created_at) where status = 'open';

-- ── 사칭 탐지용 정식 도메인 ────────────────────────────────────────
-- 지금은 lib/scanner/brands.ts 에 코드로 들어 있다. 브랜드가 늘어나
-- 코드 수정 없이 추가해야 할 때 이 테이블로 옮긴다.
-- ⚠️ 옮기기 전에 verified 를 반드시 채울 것. 목록이 틀리면 정상 사이트가
--    사칭으로 잡히거나(오탐), 오타 도메인을 산 공격자가 통과한다(우회).
create table brand_whitelist (
  id               uuid primary key default gen_random_uuid(),
  brand_name       text not null,
  category         text not null,
  official_domains text[] not null,
  verified         boolean not null default false,
  verified_at      timestamptz,
  created_at       timestamptz not null default now()
);

-- ── 접근 제어 ──────────────────────────────────────────────────────
-- 모든 테이블에 RLS를 켠다. 서버(service_role)만 읽고 쓴다.
-- 브라우저에서 anon 키로 직접 접근하는 경로를 두지 않는다 — 신고자 IP 해시와
-- 위험 판정된 주소 원문이 들어 있는 테이블이다.
alter table domains enable row level security;
alter table scans enable row level security;
alter table shared_results enable row level security;
alter table reports enable row level security;
alter table appeals enable row level security;
alter table brand_whitelist enable row level security;
