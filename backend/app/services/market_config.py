"""국가별 주요 주식 지수 매핑 및 시장 운영 시간 (UTC 기준)"""

MARKET_CONFIG = [
    # 북미
    {"country_code": "US", "index_name": "S&P 500",     "index_name_ko": "S&P 500",     "ticker": "^GSPC", "open_utc": "14:30", "close_utc": "21:00", "timezone": "America/New_York"},
    {"country_code": "CA", "index_name": "S&P/TSX",     "index_name_ko": "S&P/TSX",     "ticker": "^GSPTSE","open_utc": "14:30", "close_utc": "21:00", "timezone": "America/Toronto"},
    {"country_code": "MX", "index_name": "IPC",          "index_name_ko": "IPC",          "ticker": "^MXX",  "open_utc": "14:30", "close_utc": "21:00", "timezone": "America/Mexico_City"},

    # 남미
    {"country_code": "BR", "index_name": "IBOVESPA",    "index_name_ko": "보베스파",      "ticker": "^BVSP", "open_utc": "13:00", "close_utc": "20:55", "timezone": "America/Sao_Paulo"},
    {"country_code": "AR", "index_name": "MERVAL",      "index_name_ko": "메르발",        "ticker": "^MERV", "open_utc": "14:00", "close_utc": "21:00", "timezone": "America/Argentina/Buenos_Aires"},

    # 유럽
    {"country_code": "GB", "index_name": "FTSE 100",    "index_name_ko": "FTSE 100",     "ticker": "^FTSE", "open_utc": "08:00", "close_utc": "16:30", "timezone": "Europe/London"},
    {"country_code": "DE", "index_name": "DAX",         "index_name_ko": "DAX",          "ticker": "^GDAXI","open_utc": "07:00", "close_utc": "15:30", "timezone": "Europe/Berlin"},
    {"country_code": "FR", "index_name": "CAC 40",      "index_name_ko": "CAC 40",       "ticker": "^FCHI", "open_utc": "07:00", "close_utc": "15:30", "timezone": "Europe/Paris"},
    {"country_code": "IT", "index_name": "FTSE MIB",    "index_name_ko": "FTSE MIB",     "ticker": "FTSEMIB.MI","open_utc": "07:00", "close_utc": "15:30", "timezone": "Europe/Rome"},
    {"country_code": "ES", "index_name": "IBEX 35",     "index_name_ko": "IBEX 35",      "ticker": "^IBEX", "open_utc": "07:00", "close_utc": "15:30", "timezone": "Europe/Madrid"},
    {"country_code": "NL", "index_name": "AEX",         "index_name_ko": "AEX",          "ticker": "^AEX",  "open_utc": "07:00", "close_utc": "15:30", "timezone": "Europe/Amsterdam"},
    {"country_code": "CH", "index_name": "SMI",         "index_name_ko": "SMI",          "ticker": "^SSMI", "open_utc": "07:00", "close_utc": "15:30", "timezone": "Europe/Zurich"},
    {"country_code": "SE", "index_name": "OMX 30",      "index_name_ko": "OMX 30",       "ticker": "^OMX",  "open_utc": "07:00", "close_utc": "15:25", "timezone": "Europe/Stockholm"},
    {"country_code": "PL", "index_name": "WIG20",       "index_name_ko": "WIG20",        "ticker": "^WIG20","open_utc": "07:00", "close_utc": "15:50", "timezone": "Europe/Warsaw"},
    {"country_code": "TR", "index_name": "BIST 100",    "index_name_ko": "BIST 100",     "ticker": "XU100.IS","open_utc": "07:00", "close_utc": "14:00","timezone": "Europe/Istanbul"},

    # 아시아
    {"country_code": "JP", "index_name": "Nikkei 225",  "index_name_ko": "닛케이 225",   "ticker": "^N225", "open_utc": "00:00", "close_utc": "06:30", "timezone": "Asia/Tokyo"},
    {"country_code": "CN", "index_name": "Shanghai",    "index_name_ko": "상하이 종합",   "ticker": "000001.SS","open_utc": "01:30","close_utc": "07:00","timezone": "Asia/Shanghai"},
    {"country_code": "HK", "index_name": "Hang Seng",   "index_name_ko": "항셍",         "ticker": "^HSI",  "open_utc": "01:30", "close_utc": "08:00", "timezone": "Asia/Hong_Kong"},
    {"country_code": "KR", "index_name": "KOSPI",       "index_name_ko": "코스피",        "ticker": "^KS11", "open_utc": "00:00", "close_utc": "06:30", "timezone": "Asia/Seoul"},
    {"country_code": "TW", "index_name": "TAIEX",       "index_name_ko": "타이완 가권",   "ticker": "^TWII", "open_utc": "01:00", "close_utc": "05:30", "timezone": "Asia/Taipei"},
    {"country_code": "IN", "index_name": "NIFTY 50",    "index_name_ko": "니프티 50",     "ticker": "^NSEI", "open_utc": "03:45", "close_utc": "10:00", "timezone": "Asia/Kolkata"},
    {"country_code": "SG", "index_name": "STI",         "index_name_ko": "STI",          "ticker": "^STI",  "open_utc": "01:00", "close_utc": "09:00", "timezone": "Asia/Singapore"},
    {"country_code": "MY", "index_name": "KLCI",        "index_name_ko": "KLCI",         "ticker": "^KLSE", "open_utc": "01:00", "close_utc": "09:00", "timezone": "Asia/Kuala_Lumpur"},
    {"country_code": "ID", "index_name": "IDX",         "index_name_ko": "인도네시아 IDX","ticker": "^JKSE", "open_utc": "01:30", "close_utc": "09:00", "timezone": "Asia/Jakarta"},
    {"country_code": "TH", "index_name": "SET",         "index_name_ko": "SET",          "ticker": "^SET.BK","open_utc": "02:30","close_utc": "09:30", "timezone": "Asia/Bangkok"},
    {"country_code": "VN", "index_name": "VN-Index",    "index_name_ko": "VN지수",        "ticker": "^VNINDEX","open_utc": "02:15","close_utc": "08:00","timezone": "Asia/Ho_Chi_Minh"},
    {"country_code": "PH", "index_name": "PSEi",        "index_name_ko": "PSEi",         "ticker": "PSEi.PS","open_utc": "01:30","close_utc": "07:30", "timezone": "Asia/Manila"},

    # 중동/아프리카
    {"country_code": "SA", "index_name": "TASI",        "index_name_ko": "사우디 TASI",   "ticker": "^TASI.SR","open_utc": "07:00","close_utc": "11:00","timezone": "Asia/Riyadh"},
    {"country_code": "ZA", "index_name": "JSE Top 40",  "index_name_ko": "남아공 JSE",    "ticker": "^J203.JO","open_utc": "07:00","close_utc": "15:00","timezone": "Africa/Johannesburg"},

    # 오세아니아
    {"country_code": "AU", "index_name": "ASX 200",     "index_name_ko": "ASX 200",      "ticker": "^AXJO", "open_utc": "23:00", "close_utc": "05:00", "timezone": "Australia/Sydney"},
]

# ticker → config 빠른 조회
TICKER_MAP = {m["ticker"]: m for m in MARKET_CONFIG}
# country_code → config 빠른 조회
COUNTRY_MAP = {m["country_code"]: m for m in MARKET_CONFIG}
