import { NewsArticle } from '@/types'

export type Category =
  | 'mobile'
  | 'ransomware'
  | 'apt'
  | 'vulnerability'
  | 'breach'
  | 'finance'
  | 'infrastructure'
  | 'cloud'
  | 'korea'

export interface CategoryDef {
  id: Category
  icon: string
  color: string
}

export const CATEGORIES: CategoryDef[] = [
  { id: 'mobile',         icon: '📱', color: '#00B4D8' },
  { id: 'ransomware',     icon: '🔒', color: '#FF2D2D' },
  { id: 'apt',            icon: '🌐', color: '#CC00FF' },
  { id: 'vulnerability',  icon: '🔓', color: '#FF8C00' },
  { id: 'breach',         icon: '💧', color: '#FFD700' },
  { id: 'finance',        icon: '💰', color: '#39FF14' },
  { id: 'infrastructure', icon: '🏭', color: '#FF6030' },
  { id: 'cloud',          icon: '☁️',  color: '#4CC9F0' },
  { id: 'korea',          icon: '🇰🇷', color: '#FF6B9D' },
]

// 카테고리별 매칭 키워드 (소문자, 제목+본문에서 부분 일치)
const MATCHERS: Record<Category, string[]> = {
  mobile: [
    'android', 'ios', 'iphone', 'ipad', 'mobile malware', 'mobile threat',
    'mobile security', 'mobile device', 'smartphone',
    'apk', 'google play', 'play store', 'malicious app', 'fake app',
    'trojanized app', 'sideload', 'testflight',
    'sim swap', 'sim swapping', 'sim hijack',
    'zero-click', 'zero click', 'pegasus', 'stalkerware',
    'webkit', 'jailbreak', 'rooting', 'baseband', 'imsi', 'stingray',
    'banking trojan', 'clipper malware', 'overlay attack',
    'mdm bypass', 'nfc attack', 'bluetooth exploit',
    '모바일', '스마트폰', '악성앱', '심스와핑',
    '문자사기', '소액결제 사기', '원격제어앱', '페가수스',
    '앱스토어 악성', '구글플레이 악성',
  ],
  ransomware: [
    'ransomware', 'ransom demand', 'ransom payment', 'ransom note',
    'file encrypt', 'lockbit', 'clop', 'alphv', 'blackcat', 'akira',
    'rhysida', 'play ransomware', 'medusa', 'black basta',
    '랜섬웨어', '랜섬 요구', '랜섬머니',
  ],
  apt: [
    'apt', 'nation-state', 'nation state', 'state-sponsored', 'state sponsored',
    'espionage', 'cyber espionage', 'threat actor', 'threat group',
    'north korea', 'lazarus', 'kimsuky', 'andariel',
    'china', 'volt typhoon', 'salt typhoon', 'mustang panda',
    'russia', 'sandworm', 'fancy bear', 'cozy bear', 'nobelium',
    'iran', 'charming kitten', 'phosphorus',
    '국가배후', '국가지원', '국가연계', '북한', '라자루스', '김수키',
    '중국 해커', '러시아 해커', '이란 해커',
  ],
  vulnerability: [
    'cve-', 'vulnerability', 'zero-day', '0-day', 'n-day',
    'patch tuesday', 'security update', 'emergency patch',
    'proof-of-concept', 'poc exploit', 'cvss',
    'memory corruption', 'buffer overflow', 'use-after-free',
    'ssrf', 'rce', 'remote code execution', 'lpe',
    'privilege escalation', 'bypass vulnerability',
    '취약점', '패치', '제로데이', '보안패치', '긴급패치', '보안 업데이트',
  ],
  breach: [
    'data breach', 'data leak', 'data theft', 'database leak',
    'leaked database', 'exposed records', 'stolen data',
    'personal information', 'personally identifiable',
    'dark web sale', 'darknet forum', 'information disclosure',
    '데이터 유출', '정보유출', '개인정보 유출', '개인정보 침해',
    '개인정보 노출', '다크웹', '정보 탈취', '데이터베이스 유출',
  ],
  finance: [
    'bank', 'banking trojan', 'financial institution', 'fintech',
    'cryptocurrency', 'crypto theft', 'crypto hack',
    'bitcoin', 'ethereum', 'exchange hack', 'defi exploit',
    'bec', 'business email compromise', 'wire transfer fraud',
    'atm', 'payment system', 'credit card', 'skimmer',
    '금융', '암호화폐', '가상자산', '거래소 해킹',
    '뱅킹', '금융사기', '보이스피싱', '코인', '디파이',
  ],
  infrastructure: [
    'scada', 'ics', 'industrial control', 'operational technology',
    'power grid', 'water treatment', 'water system',
    'critical infrastructure', 'hospital attack', 'healthcare',
    'energy sector', 'pipeline', 'nuclear', 'transportation',
    'manufacturing attack', 'ot security',
    '기반시설', '산업제어', '전력망', '병원 해킹',
    '에너지', '제조업', '수도', '원자력',
  ],
  cloud: [
    'aws', 'azure', 'google cloud', 'gcp', 'cloud storage',
    's3 bucket', 'kubernetes', 'docker', 'container security',
    'cloud misconfiguration', 'cloud breach', 'saas', 'iaas',
    'cloud credentials', 'cloud account',
    '클라우드', '클라우드 보안', '클라우드 침해',
  ],
  korea: [
    'south korea', 'korean government', 'korean company',
    'korean bank', 'korean military', 'korea cybersecurity',
    'kisa', 'korea internet security',
    '한국', '국내', '대한민국', '한국인터넷진흥원',
    '금융보안원', '국정원', '한국 기업', '한국 정부',
    '국내 기업', '국내 기관', '국내 해킹',
  ],
}

/** 기사 하나에서 해당하는 카테고리 목록을 반환 */
export function detectCategories(article: NewsArticle): Category[] {
  const text = [
    article.summary_title ?? '',
    article.summary_what ?? '',
    article.summary_impact ?? '',
  ]
    .join(' ')
    .toLowerCase()

  return (Object.entries(MATCHERS) as [Category, string[]][])
    .filter(([, keywords]) => keywords.some((kw) => text.includes(kw)))
    .map(([cat]) => cat)
}

/** articles 배열을 선택된 카테고리(OR 조건)로 필터링 */
export function filterByCategories(
  articles: NewsArticle[],
  selected: Set<Category>
): NewsArticle[] {
  if (selected.size === 0) return articles
  return articles.filter((a) => {
    const cats = detectCategories(a)
    return cats.some((c) => selected.has(c))
  })
}
