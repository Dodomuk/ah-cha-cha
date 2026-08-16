/**
 * Supabase (PostgreSQL) 접근.
 *
 * 🚨 여기서 쓰는 키는 RLS를 우회하는 서버 전용 키다. 이 모듈을 클라이언트
 *    컴포넌트에서 import하지 말 것. 브라우저 번들에 들어가면 신고자 IP 해시와
 *    위험 판정된 주소 원문이 통째로 노출된다.
 *
 * 키가 없으면 null을 반환한다. DB 없이도 검사 자체는 동작해야 한다.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

export function db(): SupabaseClient | null {
  if (client !== undefined) return client;

  // NEXT_PUBLIC_ 접두사를 쓰지 않는다. 이 값은 서버에서만 필요하고,
  // 접두사를 붙이면 브라우저 번들에 들어간다
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    client = null;
    return client;
  }

  try {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch (error) {
    // 🚨 여기서 던지면 검사 전체가 실패한다. DB는 부가 기능이지 필수 경로가
    //    아니다 — 결과를 못 남기는 것과 검사를 못 하는 것은 전혀 다른 일이다.
    //    (실제로 걸렸던 경우: Node 20에서 Supabase 클라이언트가 WebSocket을
    //     찾지 못해 생성자에서 던진다. 로컬 스크립트·벤치가 통째로 멈췄다)
    console.error(
      "[db] Supabase 클라이언트를 만들지 못했습니다:",
      error instanceof Error ? error.message : error,
    );
    client = null;
  }
  return client;
}

export function dbConfigured(): boolean {
  return db() !== null;
}
