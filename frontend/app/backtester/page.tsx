'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'
import { DayPicker } from 'react-day-picker'
import { format } from 'date-fns'
import 'react-day-picker/dist/style.css'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface Stock {
  symbol: string
  name_ko: string
  sector: string
  market: string
}

interface Condition {
  id: string
  type: string
  short_window?: number
  long_window?: number
  level?: number
}

interface BacktestResult {
  success: boolean
  symbol: string
  name: string
  period: string
  metrics: {
    total_return: number
    annual_return: number
    max_drawdown: number
    sharpe_ratio: number
    win_rate: number
    trades_count: number
  }
  trades: Array<{
    date: string
    trade_type: string
    price: number
    quantity: number
    return_pct?: number
  }>
  equity_curve: Array<{
    date: string
    equity: number
    return: number
  }>
}

const CONDITION_TYPES = [
  { value: 'ma_cross_above', label: '↗ MA 상향' },
  { value: 'ma_cross_below', label: '↘ MA 하향' },
  { value: 'rsi_below', label: '🔴 RSI 저' },
  { value: 'rsi_above', label: '🟢 RSI 고' },
  { value: 'stochastic_oversold', label: '⬇️ Stoch 저' },
  { value: 'stochastic_overbought', label: '⬆️ Stoch 고' },
]

export default function BacktesterPage() {
  const [stocks, setStocks] = useState<Stock[]>([])
  const [selectedSymbol, setSelectedSymbol] = useState('')
  const [startDate, setStartDate] = useState<Date>(new Date('2024-01-01'))
  const [endDate, setEndDate] = useState<Date>(new Date('2024-12-31'))
  const [showStartCal, setShowStartCal] = useState(false)
  const [showEndCal, setShowEndCal] = useState(false)
  const [conditions, setConditions] = useState<Condition[]>([
    { id: '1', type: 'ma_cross_above', short_window: 5, long_window: 20 },
  ])
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [strategyName, setStrategyName] = useState('')

  useEffect(() => {
    const fetchStocks = async () => {
      try {
        const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/backtest/stocks?limit=100`)
        setStocks(res.data.stocks)
        if (res.data.stocks.length > 0) {
          setSelectedSymbol(res.data.stocks[0].symbol)
        }
      } catch (err) {
        console.error('Failed to fetch stocks:', err)
      }
    }
    fetchStocks()
  }, [])

  const handleRunBacktest = async () => {
    if (!selectedSymbol) {
      setError('종목을 선택해주세요')
      return
    }

    setLoading(true)
    setError('')

    try {
      const payload = {
        symbol: selectedSymbol,
        start_date: format(startDate, 'yyyy-MM-dd'),
        end_date: format(endDate, 'yyyy-MM-dd'),
        conditions: conditions.map(c => ({
          type: c.type,
          short_window: c.short_window,
          long_window: c.long_window,
          level: c.level,
        })),
        initial_cash: 1_000_000,
      }

      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/backtest/run`,
        payload
      )

      if (res.data.success) {
        setResult(res.data)
      } else {
        setError(res.data.error || '백테스트 실패')
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || '요청 중 오류 발생')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveStrategy = async () => {
    if (!result || !strategyName) {
      setError('전략 이름을 입력해주세요')
      return
    }

    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/backtest/strategies/save`, {
        name: strategyName,
        symbol: result.symbol,
        start_date: format(startDate, 'yyyy-MM-dd'),
        end_date: format(endDate, 'yyyy-MM-dd'),
        conditions: conditions.map(c => ({
          type: c.type,
          short_window: c.short_window,
          long_window: c.long_window,
          level: c.level,
        })),
        total_return: result.metrics.total_return,
        max_drawdown: result.metrics.max_drawdown,
        sharpe_ratio: result.metrics.sharpe_ratio,
        win_rate: result.metrics.win_rate,
        trades_count: result.metrics.trades_count,
        is_public: true,
      })

      alert('전략이 저장되었습니다!')
      setStrategyName('')
    } catch (err: any) {
      setError('전략 저장 실패')
    }
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

  const selectedStock = stocks.find(s => s.symbol === selectedSymbol)

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-full h-screen flex flex-col">
        {/* 헤더 */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold">📈 Quant Backtester</h1>
          <p className="text-gray-400 text-sm mt-2">전략 백테스트 및 분석</p>
        </div>

        {/* 메인 컨테이너 */}
        <div className="flex gap-6 flex-1 overflow-hidden">
          {/* 왼쪽: 설정 패널 */}
          <div className="w-80 bg-white/5 border border-white/10 rounded-2xl p-7 overflow-y-auto">
            <h2 className="text-lg font-bold mb-6">조건 설정</h2>

            {/* 종목 선택 */}
            <div className="mb-8">
              <label className="text-xs text-gray-400 uppercase tracking-wider block mb-4">종목</label>
              <select
                value={selectedSymbol}
                onChange={e => setSelectedSymbol(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-5 py-3 text-white text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">선택...</option>
                {stocks.map(s => (
                  <option key={s.symbol} value={s.symbol}>
                    {s.name_ko} ({s.symbol})
                  </option>
                ))}
              </select>
              {selectedStock && (
                <div className="mt-4 text-xs text-gray-400">
                  <p>{selectedStock.sector} • {selectedStock.market}</p>
                </div>
              )}
            </div>

            {/* 기간 선택 */}
            <div className="mb-8">
              <label className="text-xs text-gray-400 uppercase tracking-wider block mb-4">기간</label>
              <div className="space-y-3">
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowStartCal(!showStartCal)
                      setShowEndCal(false)
                    }}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-5 py-3 text-white text-sm text-left hover:bg-white/10 transition-all"
                  >
                    {format(startDate, 'yyyy.MM.dd')}
                  </button>
                  {showStartCal && (
                    <div className="absolute top-full left-0 mt-3 bg-slate-900 border border-white/10 rounded-lg p-3 z-50 shadow-xl text-white">
                      <DayPicker
                        mode="single"
                        selected={startDate}
                        onSelect={date => {
                          if (date) setStartDate(date)
                          setShowStartCal(false)
                        }}
                      />
                    </div>
                  )}
                </div>

                <div className="relative">
                  <button
                    onClick={() => {
                      setShowEndCal(!showEndCal)
                      setShowStartCal(false)
                    }}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-5 py-3 text-white text-sm text-left hover:bg-white/10 transition-all"
                  >
                    {format(endDate, 'yyyy.MM.dd')}
                  </button>
                  {showEndCal && (
                    <div className="absolute top-full left-0 mt-3 bg-slate-900 border border-white/10 rounded-lg p-3 z-50 shadow-xl text-white">
                      <DayPicker
                        mode="single"
                        selected={endDate}
                        onSelect={date => {
                          if (date) setEndDate(date)
                          setShowEndCal(false)
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 조건 목록 (Latest News 스타일) */}
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
                      <div className="flex items-center justify-between mb-2">
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
                        <div className="grid grid-cols-2 gap-2 text-xs">
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
                          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-sm text-center focus:outline-none"
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
              onClick={handleRunBacktest}
              disabled={loading || !selectedSymbol}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-all"
            >
              {loading ? '분석 중...' : '백테스트 실행'}
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
                  <p className="text-lg text-gray-400">백테스트를 실행하세요</p>
                </div>
              </div>
            ) : (
              <div className="space-y-8 pr-6">
                {/* 제목 */}
                <div>
                  <h2 className="text-2xl font-bold">{result.name}</h2>
                  <p className="text-sm text-gray-400 mt-1">{result.period}</p>
                </div>

                {/* 핵심 지표 (4개) */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-white/5 border border-white/10 rounded-lg p-5">
                    <p className="text-xs text-gray-400 mb-3">수익률</p>
                    <p className={`text-2xl font-bold ${result.metrics.total_return >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {result.metrics.total_return > 0 ? '+' : ''}{result.metrics.total_return}%
                    </p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-5">
                    <p className="text-xs text-gray-400 mb-3">연환산</p>
                    <p className="text-2xl font-bold">{result.metrics.annual_return}%</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-5">
                    <p className="text-xs text-gray-400 mb-3">MDD</p>
                    <p className="text-2xl font-bold text-orange-400">{result.metrics.max_drawdown}%</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-5">
                    <p className="text-xs text-gray-400 mb-3">Sharpe</p>
                    <p className="text-2xl font-bold">{result.metrics.sharpe_ratio}</p>
                  </div>
                </div>

                {/* 자산 곡선 */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-7">
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={result.equity_curve} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="0" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="date" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11 }} />
                      <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(0, 0, 0, 0.8)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          borderRadius: '0.5rem',
                        }}
                        labelStyle={{ color: '#fff' }}
                      />
                      <Area type="monotone" dataKey="equity" stroke="#3b82f6" fillOpacity={1} fill="url(#colorEquity)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* 거래 통계 */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
                    <p className="text-xs text-gray-400 mb-3">총 거래</p>
                    <p className="text-2xl font-bold">{result.metrics.trades_count}</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
                    <p className="text-xs text-gray-400 mb-3">승률</p>
                    <p className="text-2xl font-bold text-green-400">{result.metrics.win_rate}%</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
                    <p className="text-xs text-gray-400 mb-3">거래 수</p>
                    <p className="text-2xl font-bold">{result.trades.length}</p>
                  </div>
                </div>

                {/* 매매 기록 */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-7">
                  <p className="text-sm font-semibold mb-4">매매 기록</p>
                  <div className="max-h-48 overflow-y-auto">
                    <div className="space-y-2">
                      {result.trades.map((trade, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm p-2 hover:bg-white/5 rounded transition-all">
                          <div className="flex-1">
                            <p className="text-gray-300">{trade.date}</p>
                            <p className="text-xs text-gray-500">${trade.price.toLocaleString()}</p>
                          </div>
                          <span
                            className={`px-2 py-1 rounded text-xs font-semibold ${
                              trade.trade_type === 'BUY'
                                ? 'bg-blue-500/30 text-blue-200'
                                : 'bg-red-500/30 text-red-200'
                            }`}
                          >
                            {trade.trade_type}
                          </span>
                          <p className={`text-sm font-semibold w-16 text-right ${
                            trade.return_pct != null && trade.return_pct > 0
                              ? 'text-green-400'
                              : 'text-red-400'
                          }`}>
                            {trade.return_pct != null ? `${trade.return_pct.toFixed(2)}%` : '-'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 전략 저장 */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-7">
                  <p className="text-sm font-semibold mb-4">전략 저장</p>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder="전략 이름"
                      value={strategyName}
                      onChange={e => setStrategyName(e.target.value)}
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-5 py-3 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                    />
                    <button
                      onClick={handleSaveStrategy}
                      className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-all"
                    >
                      저장
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DayPicker 스타일 커스터마이징 */}
      <style jsx global>{`
        .rdp {
          --color-brand: #3b82f6;
          --color-gray-100: rgba(255, 255, 255, 0.1);
          --color-gray-900: rgba(15, 23, 42, 0.9);
        }

        .rdp-cell {
          padding: 0.25rem;
        }

        .rdp-day {
          border-radius: 0.375rem;
          font-size: 0.875rem;
        }

        .rdp-day_selected {
          background-color: #3b82f6;
          color: white;
        }

        .rdp-day_today {
          font-weight: bold;
          color: #3b82f6;
        }

        .rdp-head_cell {
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.5);
        }
      `}</style>
    </div>
  )
}
