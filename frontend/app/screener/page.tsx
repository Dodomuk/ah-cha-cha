'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface Condition {
  id: string
  type: string
  short_window?: number
  long_window?: number
  level?: number
}

interface ScreeningResult {
  symbol: string
  name_ko: string
  sector?: string
  market: string
  price: number
  change_pct: number
  volume: number
}

interface ScreeningResponse {
  date: string
  total_count: number
  results: ScreeningResult[]
  error?: string
}

const CONDITION_TYPES = [
  { value: 'ma_cross_above', label: '↗ MA 상향' },
  { value: 'ma_cross_below', label: '↘ MA 하향' },
  { value: 'rsi_below', label: '🔴 RSI 저' },
  { value: 'rsi_above', label: '🟢 RSI 고' },
  { value: 'stochastic_oversold', label: '⬇️ Stoch 저' },
  { value: 'stochastic_overbought', label: '⬆️ Stoch 고' },
]

export default function ScreenerPage() {
  const [conditions, setConditions] = useState<Condition[]>([
    { id: '1', type: 'ma_cross_above', short_window: 5, long_window: 20 },
  ])
  const [result, setResult] = useState<ScreeningResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleRunScreening = async () => {
    setLoading(true)
    setError('')

    try {
      const isProduction = typeof window !== 'undefined' && window.location.hostname === 'ahchacha.com'
      const apiBase = process.env.NEXT_PUBLIC_API_URL || (isProduction ? 'https://ah-cha-cha.onrender.com' : 'http://localhost:8000')

      const payload = {
        conditions: conditions.map(c => ({
          type: c.type,
          short_window: c.short_window,
          long_window: c.long_window,
          level: c.level,
        })),
      }

      const res = await axios.post(
        `${apiBase}/api/backtest/screen`,
        payload
      )

      if (res.data) {
        setResult(res.data)
      } else {
        setError('스크리닝 실패')
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || '요청 중 오류 발생')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadCSV = () => {
    if (!result || result.results.length === 0) {
      setError('다운로드할 데이터가 없습니다')
      return
    }

    const headers = ['Symbol', 'Name', 'Sector', 'Market', 'Price', 'Change %', 'Volume']
    const csvContent = [
      headers.join(','),
      ...result.results.map(r =>
        [r.symbol, r.name_ko, r.sector || '-', r.market, r.price, r.change_pct, r.volume].join(',')
      ),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `screening_${result.date}.csv`
    link.click()
  }

  const addCondition = () => {
    setConditions([
      ...conditions,
      {
        id: Date.now().toString(),
        type: 'ma_cross_above',
        short_window: 5,
        long_window: 20,
      },
    ])
  }

  const removeCondition = (id: string) => {
    if (conditions.length > 1) {
      setConditions(conditions.filter(c => c.id !== id))
    }
  }

  const updateCondition = (id: string, field: string, value: any) => {
    setConditions(
      conditions.map(c =>
        c.id === id ? { ...c, [field]: value } : c
      )
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-full h-screen flex flex-col">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">🔍 Stock Screener</h1>
          <p className="text-gray-400 text-sm mt-2">조건을 만족하는 종목 찾기</p>
        </div>

        {/* 메인 컨테이너 */}
        <div className="flex gap-8 flex-1 overflow-hidden">
          {/* 왼쪽: 설정 패널 */}
          <div className="w-80 bg-white/5 border border-white/10 rounded-2xl p-7 overflow-y-auto">
            <h2 className="text-lg font-bold mb-8">스크리닝 조건</h2>

            {/* 조건 목록 */}
            <div className="mb-8">
              <label className="text-xs text-gray-400 uppercase tracking-wider block mb-4">조건</label>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {conditions.map((cond, idx) => {
                  const condType = CONDITION_TYPES.find(t => t.value === cond.type)
                  return (
                    <div
                      key={cond.id}
                      className="group p-4 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <select
                          value={cond.type}
                          onChange={e => updateCondition(cond.id, 'type', e.target.value)}
                          className="flex-1 bg-transparent text-sm text-white focus:outline-none"
                        >
                          {CONDITION_TYPES.map(t => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        {conditions.length > 1 && (
                          <button
                            onClick={() => removeCondition(cond.id)}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 text-sm transition-all ml-2"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {(cond.type === 'ma_cross_above' || cond.type === 'ma_cross_below') && (
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <input
                            type="number"
                            value={cond.short_window || 5}
                            onChange={e =>
                              updateCondition(cond.id, 'short_window', parseInt(e.target.value))
                            }
                            placeholder="단기"
                            className="bg-white/5 border border-white/10 rounded px-3 py-2 text-white text-center focus:outline-none"
                          />
                          <input
                            type="number"
                            value={cond.long_window || 20}
                            onChange={e =>
                              updateCondition(cond.id, 'long_window', parseInt(e.target.value))
                            }
                            placeholder="장기"
                            className="bg-white/5 border border-white/10 rounded px-3 py-2 text-white text-center focus:outline-none"
                          />
                        </div>
                      )}

                      {['rsi_below', 'rsi_above', 'stochastic_oversold', 'stochastic_overbought'].includes(cond.type) && (
                        <input
                          type="number"
                          value={cond.level || 30}
                          onChange={e => updateCondition(cond.id, 'level', parseInt(e.target.value))}
                          placeholder="임계값"
                          className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white text-sm text-center focus:outline-none"
                        />
                      )}
                    </div>
                  )
                })}
              </div>

              <button
                onClick={addCondition}
                className="w-full mt-3 py-2 text-sm text-gray-400 hover:text-white border border-white/10 rounded-lg hover:bg-white/5 transition-all"
              >
                + 조건 추가
              </button>
            </div>

            {/* 실행 버튼 */}
            <button
              onClick={handleRunScreening}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-all"
            >
              {loading ? '스크리닝 중...' : '스크리닝 실행'}
            </button>

            {error && (
              <div className="mt-5 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 text-sm">
                {error}
              </div>
            )}
          </div>

          {/* 오른쪽: 결과 표시 */}
          <div className="flex-1 overflow-y-auto">
            {!result ? (
              <div className="h-full flex items-center justify-center bg-white/5 border border-white/10 rounded-2xl">
                <div className="text-center">
                  <p className="text-lg text-gray-400">스크리닝을 실행하세요</p>
                </div>
              </div>
            ) : (
              <div className="space-y-8 pr-6">
                {/* 제목 */}
                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-bold">결과</h2>
                      <p className="text-sm text-gray-400 mt-2">{result.date}</p>
                    </div>
                    {result.results.length > 0 && (
                      <button
                        onClick={handleDownloadCSV}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-all"
                      >
                        📥 CSV 다운로드
                      </button>
                    )}
                  </div>
                </div>

                {/* 결과 카운트 */}
                <div className="bg-white/5 border border-white/10 rounded-lg p-5">
                  <p className="text-sm text-gray-400 mb-1">조건을 만족하는 종목</p>
                  <p className="text-3xl font-bold text-green-400">{result.total_count}개</p>
                </div>

                {/* 결과 테이블 */}
                {result.results.length > 0 ? (
                  <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-white/10 bg-white/5">
                          <tr>
                            <th className="px-5 py-3 text-left text-xs font-bold text-gray-400 uppercase">종목</th>
                            <th className="px-5 py-3 text-left text-xs font-bold text-gray-400 uppercase">섹터</th>
                            <th className="px-5 py-3 text-right text-xs font-bold text-gray-400 uppercase">현재가</th>
                            <th className="px-5 py-3 text-right text-xs font-bold text-gray-400 uppercase">등락률</th>
                            <th className="px-5 py-3 text-right text-xs font-bold text-gray-400 uppercase">거래량</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.results.map((stock, idx) => (
                            <tr
                              key={stock.symbol}
                              className="border-b border-white/5 hover:bg-white/5 transition-all"
                            >
                              <td className="px-5 py-4">
                                <div>
                                  <p className="font-semibold">{stock.symbol}</p>
                                  <p className="text-xs text-gray-400">{stock.name_ko}</p>
                                </div>
                              </td>
                              <td className="px-5 py-4 text-sm text-gray-400">{stock.sector || '-'}</td>
                              <td className="px-5 py-4 text-right font-semibold">{stock.price.toLocaleString()}</td>
                              <td className={`px-5 py-4 text-right font-semibold ${
                                stock.change_pct > 0 ? 'text-green-400' : 'text-red-400'
                              }`}>
                                {stock.change_pct > 0 ? '+' : ''}{stock.change_pct}%
                              </td>
                              <td className="px-5 py-4 text-right text-gray-400 text-sm">
                                {(stock.volume / 1000000).toFixed(1)}M
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
                    <p className="text-gray-400">조건을 만족하는 종목이 없습니다</p>
                  </div>
                )}

                {result.error && (
                  <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-200 text-sm">
                    {result.error}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
