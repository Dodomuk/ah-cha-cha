export type Lang = 'ko' | 'en'

export interface Translations {
  // Header
  title: string
  subtitle: string
  lastUpdated: string
  headerLoading: string
  // Page
  loadingMap: string
  updatingMap: string
  // StatsBar
  stats7d: string
  statsToday: string
  statsUnit: string
  levelCritical: string
  levelHigh: string
  levelMedium: string
  levelLow: string
  // CountryPanel
  securityIssues: (n: number) => string
  noIssues: string
  panelLoading: string
  // NewsCard
  whatLabel: string
  impactLabel: string
  viewSource: string
  // DailyReportPanel
  dailyReport: string
  dailyReportDate: (date: string, count: number) => string
  noArticles: string
  reportLoading: string
  overviewLabel: string
  damagesLabel: string
  viewSourceLink: string
  // Report download text
  reportHeader: string
  reportDateLine: (date: string, count: number) => string
  reportOverview: string
  reportImpact: string
  reportSource: string
  // TrendChart
  trendLabel: string
  // Category filter
  categoryAll: string
  categoryMobile: string
  categoryRansomware: string
  categoryApt: string
  categoryVulnerability: string
  categoryBreach: string
  categoryFinance: string
  categoryInfrastructure: string
  categoryCloud: string
  categoryKorea: string
  // Search
  searchTitle: string
  searchPlaceholder: string
  searchNoResults: string
  searchTip: string
  // Locale
  dateLocale: string
}

export const translations: Record<Lang, Translations> = {
  ko: {
    title: '아차차',
    subtitle: 'SECURITY INTELLIGENCE',
    lastUpdated: '마지막 업데이트:',
    headerLoading: '로딩 중...',

    loadingMap: '보안 위협 데이터 로딩 중...',
    updatingMap: '지도 갱신 중...',

    stats7d: '7일 수집',
    statsToday: '오늘 탐지',
    statsUnit: '건',
    levelCritical: '위험',
    levelHigh: '경고',
    levelMedium: '주의',
    levelLow: '낮음',

    securityIssues: (n) => `보안 이슈 ${n}건`,
    noIssues: '해당 기간 내 보안 이슈 없음',
    panelLoading: '로딩 중...',

    whatLabel: '무슨 일',
    impactLabel: '영향',
    viewSource: '원문 보기 →',

    dailyReport: '일일 보안 리포트',
    dailyReportDate: (date, count) => `${date} · ${count}건`,
    noArticles: '오늘 수집된 보안 기사가 없습니다',
    reportLoading: '로딩 중...',
    overviewLabel: '사건 개요',
    damagesLabel: '피해/영향',
    viewSourceLink: '원문 보기',

    reportHeader: '아차차 (Ah-Cha-Cha) 일일 보안 리포트',
    reportDateLine: (date, count) => `생성일: ${date}  |  총 ${count}건`,
    reportOverview: '▸ 사건 개요',
    reportImpact: '▸ 피해/영향',
    reportSource: '▸ 출처:',

    trendLabel: '7일 위협 추이',

    categoryAll: '전체',
    categoryMobile: '모바일',
    categoryRansomware: '랜섬웨어',
    categoryApt: '국가배후',
    categoryVulnerability: '취약점/CVE',
    categoryBreach: '데이터 유출',
    categoryFinance: '금융/암호화폐',
    categoryInfrastructure: '산업/인프라',
    categoryCloud: '클라우드',
    categoryKorea: '국내',

    searchTitle: '기사 검색',
    searchPlaceholder: '키워드 검색...',
    searchNoResults: '검색 결과가 없습니다',
    searchTip: '2자 이상 입력하세요',

    dateLocale: 'ko-KR',
  },
  en: {
    title: 'Ah-Cha-Cha',
    subtitle: 'SECURITY INTELLIGENCE',
    lastUpdated: 'Last updated:',
    headerLoading: 'Loading...',

    loadingMap: 'Loading threat data...',
    updatingMap: 'Updating map...',

    stats7d: '7-day',
    statsToday: 'Today',
    statsUnit: '',
    levelCritical: 'Critical',
    levelHigh: 'High',
    levelMedium: 'Medium',
    levelLow: 'Low',

    securityIssues: (n) => `${n} issue${n !== 1 ? 's' : ''}`,
    noIssues: 'No security issues in this period',
    panelLoading: 'Loading...',

    whatLabel: 'What',
    impactLabel: 'Impact',
    viewSource: 'View source →',

    dailyReport: 'Daily Security Report',
    dailyReportDate: (date, count) => `${date} · ${count} items`,
    noArticles: 'No security articles collected today',
    reportLoading: 'Loading...',
    overviewLabel: 'Overview',
    damagesLabel: 'Impact',
    viewSourceLink: 'View source',

    reportHeader: 'Ah-Cha-Cha Daily Security Report',
    reportDateLine: (date, count) => `Generated: ${date}  |  Total ${count} items`,
    reportOverview: '▸ Overview',
    reportImpact: '▸ Impact',
    reportSource: '▸ Source:',

    trendLabel: '7-day Trend',

    categoryAll: 'All',
    categoryMobile: 'Mobile',
    categoryRansomware: 'Ransomware',
    categoryApt: 'Nation-state',
    categoryVulnerability: 'Vuln/CVE',
    categoryBreach: 'Data Breach',
    categoryFinance: 'Finance/Crypto',
    categoryInfrastructure: 'Infrastructure',
    categoryCloud: 'Cloud',
    categoryKorea: 'Korea',

    searchTitle: 'Search Articles',
    searchPlaceholder: 'Search keywords...',
    searchNoResults: 'No results found',
    searchTip: 'Type at least 2 characters',

    dateLocale: 'en-US',
  },
}
