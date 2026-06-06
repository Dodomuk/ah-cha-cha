'use client'

import { useState, useEffect } from 'react'
import axios from 'axios'

interface Strategy {
  id: string
  name: string
  symbol: string
  total_return: number
  max_drawdown: number
  sharpe_ratio: number
  win_rate: number
  likes: number
  views: number
  created_at: string
}

type SortBy = 'return' | 'sharpe' | 'win_rate' | 'likes'

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortBy>('return')
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchStrategies = async () => {
      try {
        const isProduction = typeof window !== 'undefined' && window.location.hostname === 'ahchacha.com'
        const apiBase = process.env.NEXT_PUBLIC_API_URL || (isProduction ? 'https://ah-cha-cha.onrender.com' : 'http://localhost:8000')

        const res = await axios.get(`${apiBase}/api/backtest/strategies/public?limit=100`)
        setStrategies(res.data.strategies || [])
      } catch (err) {
        console.error('Failed to fetch strategies:', err)
        setError('전략 조회 실패')
      } finally {
        setLoading(false)
      }
    }

    fetchStrategies()
  }, [])

  const sortedStrategies = [...strategies].sort((a, b) => {
    switch (sortBy) {
      case 'return':
        return b.total_return - a.total_return
      case 'sharpe':
        return b.sharpe_ratio - a.sharpe_ratio
      case 'win_rate':
        return b.win_rate - a.win_rate
      case 'likes':
        return b.likes - a.likes
      default:
        return 0
    }
  })

  const getReturnColor = (value: number) => {
    if (value > 20) return 'text-green-400'
    if (value > 0) return 'text-green-300'
    if (value > -10) return 'text-red-300'
    return 'text-red-400'
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold">📊 Community Strategies</h1>
          <p className="text-gray-400 text-sm mt-2">검증된 사용자 전략 랭킹</p>
        </div>

        {/* 정렬 버튼 */}
        <div className="flex gap-3 mb-8 overflow-x-auto pb-2">
          {[
            { key: 'return', label: '📈 수익률' },
            { key: 'sharpe', label: '⚡ Sharpe' },
            { key: 'win_rate', label: '🎯 승률' },
            { key: 'likes', label: '❤️ 인기' },
          ].map(btn => (
            <button
              key={btn.key}
              onClick={() => setSortBy(btn.key as SortBy)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                sortBy === btn.key
                  ? 'bg-green-600 text-white'
                  : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* 전략 리스트 */}
        {loading ? (
          <div className="text-center py-16">
            <p className="text-gray-400">로딩 중...</p>
          </div>
        ) : error ? (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-6 text-red-200 text-center">
            {error}
          </div>
        ) : strategies.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-16 text-center">
            <p className="text-gray-400 text-lg">아직 공개된 전략이 없습니다</p>
            <p className="text-gray-500 text-sm mt-2">백테스터에서 전략을 만들고 공개해보세요!</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {sortedStrategies.map(strategy => {
              const createdDate = new Date(strategy.created_at)
              const daysAgo = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24))

              return (
                <div
                  key={strategy.id}
                  className="group bg-white/5 border border-white/10 rounded-lg hover:border-white/20 hover:bg-white/8 transition-all p-6 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-6">
                    {/* 좌측: 전략 정보 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold truncate">{strategy.name}</h3>
                        <span className="text-xs px-2 py-1 bg-white/10 rounded text-gray-400 whitespace-nowrap">
                          {strategy.symbol}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {daysAgo === 0 ? '오늘' : `${daysAgo}일 전`}
                      </p>
                    </div>

                    {/* 우측: 지표들 */}
                    <div className="grid grid-cols-5 gap-4 text-center">
                      {/* 수익률 */}
                      <div className="bg-white/5 rounded-lg p-3">
                        <p className="text-xs text-gray-400 mb-1">수익률</p>
                        <p className={`text-xl font-bold ${getReturnColor(strategy.total_return)}`}>
                          {strategy.total_return > 0 ? '+' : ''}{strategy.total_return.toFixed(1)}%
                        </p>
                      </div>

                      {/* MDD */}
                      <div className="bg-white/5 rounded-lg p-3">
                        <p className="text-xs text-gray-400 mb-1">MDD</p>
                        <p className="text-xl font-bold text-orange-400">
                          {strategy.max_drawdown.toFixed(1)}%
                        </p>
                      </div>

                      {/* Sharpe */}
                      <div className="bg-white/5 rounded-lg p-3">
                        <p className="text-xs text-gray-400 mb-1">Sharpe</p>
                        <p className="text-xl font-bold text-blue-400">
                          {strategy.sharpe_ratio.toFixed(2)}
                        </p>
                      </div>

                      {/* 승률 */}
                      <div className="bg-white/5 rounded-lg p-3">
                        <p className="text-xs text-gray-400 mb-1">승률</p>
                        <p className="text-xl font-bold text-green-400">
                          {strategy.win_rate.toFixed(0)}%
                        </p>
                      </div>

                      {/* 인기도 */}
                      <div className="bg-white/5 rounded-lg p-3">
                        <p className="text-xs text-gray-400 mb-1">❤️</p>
                        <p className="text-xl font-bold text-red-400">{strategy.likes}</p>
                      </div>
                    </div>
                  </div>

                  {/* 하단: 조회/인기 정보 */}
                  <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-gray-500">
                    <span>조회 {strategy.views}회</span>
                    <span className="text-gray-400 group-hover:text-blue-400 transition-all">자세히 보기 →</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* 하단 여백 */}
        <div className="mt-16" />
      </div>
    </div>
  )
}
