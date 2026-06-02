'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import * as d3 from 'd3'
import { FeatureCollection, Geometry } from 'geojson'
import { MarketSnapshot, MarketTooltipState } from '@/types'
import MarketTooltip from './MarketTooltip'

interface MarketWorldMapProps {
  markets: Record<string, MarketSnapshot>
  onCountryClick: (code: string, name: string, x: number, y: number) => void
}

interface GeoFeature {
  type: string
  properties: Record<string, unknown>
  geometry: Geometry
}

function getCountryCode(props: Record<string, unknown>): string {
  const code = props['ISO3166-1-Alpha-2'] || props.iso_a2 || props.ISO_A2 || props.adm0_a3 || ''
  return String(code).toUpperCase()
}

/** % 등락률 → RGB 색상 */
function changePctToColor(pct: number | null): { fill: string; stroke: string; glow: string } {
  if (pct === null) return { fill: '#1c2e2e', stroke: '#2e5555', glow: 'transparent' }

  const abs = Math.abs(pct)
  const intensity = Math.min(abs / 2, 1) // 2% 이상이면 최대 채도 (더 선명하게)

  if (pct > 0) {
    const g = Math.round(160 + intensity * 95)   // 160 ~ 255
    const rb = Math.round(20 - intensity * 20)   // 20 ~ 0
    return {
      fill: `rgba(${rb},${g},${rb},0.55)`,
      stroke: `rgb(${rb},${g},${rb})`,
      glow: `rgba(0,${g},0,0.6)`,
    }
  } else {
    const r = Math.round(160 + intensity * 95)
    const gb = Math.round(20 - intensity * 20)
    return {
      fill: `rgba(${r},${gb},${gb},0.55)`,
      stroke: `rgb(${r},${gb},${gb})`,
      glow: `rgba(${r},0,0,0.6)`,
    }
  }
}

export default function MarketWorldMap({ markets, onCountryClick }: MarketWorldMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const geoDataRef = useRef<FeatureCollection | null>(null)
  const projectionRef = useRef<d3.GeoProjection | null>(null)
  const pathGeneratorRef = useRef<d3.GeoPath | null>(null)
  const hoveredCodeRef = useRef<string | null>(null)
  const animFrameRef = useRef<number>(0)
  const pathCacheRef = useRef<Map<number, Path2D>>(new Map())
  const lastMouseRef = useRef({ time: 0, x: -999, y: -999 })
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const marketsRef = useRef(markets)

  const [tooltip, setTooltip] = useState<MarketTooltipState>({
    visible: false, x: 0, y: 0, countryName: '', changePct: null, isOpen: false,
  })

  const drawMap = useCallback((hoveredCode: string | null = null) => {
    const canvas = canvasRef.current
    const geo = geoDataRef.current
    const projection = projectionRef.current
    const pathGen = pathGeneratorRef.current
    if (!canvas || !geo || !projection || !pathGen) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const mkt = marketsRef.current
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const features = geo.features as GeoFeature[]

    for (let i = 0; i < features.length; i++) {
      const feature = features[i]
      const code = getCountryCode(feature.properties)
      const snap = mkt[code]
      const hasData = !!snap
      const isHovered = code === hoveredCode
      const { fill, stroke, glow } = changePctToColor(snap?.change_pct ?? null)

      let path2D = pathCacheRef.current.get(i)
      if (!path2D) {
        path2D = new Path2D(pathGen(feature as unknown as d3.GeoPermissibleObjects) || '')
        pathCacheRef.current.set(i, path2D)
      }

      ctx.save()
      if (hasData) {
        ctx.shadowBlur = isHovered ? 20 : 8
        ctx.shadowColor = glow
      }
      ctx.fillStyle = isHovered && !hasData ? '#2a4545' : fill
      ctx.fill(path2D)
      ctx.restore()

      ctx.save()
      if (hasData && isHovered) {
        ctx.shadowBlur = 14
        ctx.shadowColor = glow
        ctx.strokeStyle = stroke
        ctx.lineWidth = (1.5 / (window.devicePixelRatio || 1)) * 1.8
      } else if (hasData) {
        ctx.shadowBlur = 4
        ctx.shadowColor = glow
        ctx.strokeStyle = stroke
        ctx.lineWidth = 1 / (window.devicePixelRatio || 1)
      } else {
        ctx.strokeStyle = '#2e5555'
        ctx.lineWidth = 0.6 / (window.devicePixelRatio || 1)
      }
      ctx.stroke(path2D)
      ctx.restore()
    }
  }, [])

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const dpr = window.devicePixelRatio || 1
    const w = container.clientWidth
    const h = container.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.scale(dpr, dpr)

    const projection = d3.geoNaturalEarth1().scale(w / 6.5).translate([w / 2, h / 2])
    projectionRef.current = projection
    pathGeneratorRef.current = d3.geoPath().projection(projection)
    pathCacheRef.current.clear()
    drawMap(hoveredCodeRef.current)
  }, [drawMap])

  useEffect(() => {
    fetch('/data/world.geojson')
      .then(r => r.json())
      .then((data: FeatureCollection) => {
        geoDataRef.current = data
        setupCanvas()
      })
  }, [setupCanvas])

  useEffect(() => {
    marketsRef.current = markets
    if (!geoDataRef.current) return
    drawMap(hoveredCodeRef.current)
  }, [markets, drawMap])

  useEffect(() => {
    const observer = new ResizeObserver(() => setupCanvas())
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [setupCanvas])

  const getFeatureAtPoint = useCallback((x: number, y: number): GeoFeature | null => {
    const canvas = canvasRef.current
    const geo = geoDataRef.current
    if (!canvas || !geo) return null
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const features = geo.features as GeoFeature[]
    ctx.save()
    ctx.resetTransform()
    let result: GeoFeature | null = null
    for (let i = 0; i < features.length; i++) {
      const path2D = pathCacheRef.current.get(i)
      if (path2D && ctx.isPointInPath(path2D, x, y)) {
        result = features[i]
        break
      }
    }
    ctx.restore()
    return result
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const now = performance.now()
    const last = lastMouseRef.current
    const dx = e.clientX - last.x
    const dy = e.clientY - last.y
    if (now - last.time < 25 && dx * dx + dy * dy < 9) return
    lastMouseRef.current = { time: now, x: e.clientX, y: e.clientY }

    const rect = canvas.getBoundingClientRect()
    const feature = getFeatureAtPoint(e.clientX - rect.left, e.clientY - rect.top)

    if (feature) {
      const code = getCountryCode(feature.properties)
      const snap = marketsRef.current[code]
      if (hoveredCodeRef.current !== code) {
        hoveredCodeRef.current = code
        cancelAnimationFrame(animFrameRef.current)
        animFrameRef.current = requestAnimationFrame(() => drawMap(code))
      }
      setTooltip({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        countryName: String(feature.properties.name || code),
        changePct: snap?.change_pct ?? null,
        isOpen: snap?.is_open ?? false,
      })
      canvas.style.cursor = snap ? 'pointer' : 'default'
    } else {
      if (hoveredCodeRef.current !== null) {
        hoveredCodeRef.current = null
        cancelAnimationFrame(animFrameRef.current)
        animFrameRef.current = requestAnimationFrame(() => drawMap(null))
      }
      setTooltip(prev => ({ ...prev, visible: false }))
      canvas.style.cursor = 'default'
    }
  }, [getFeatureAtPoint, drawMap])

  const handleMouseLeave = useCallback(() => {
    hoveredCodeRef.current = null
    setTooltip(prev => ({ ...prev, visible: false }))
    cancelAnimationFrame(animFrameRef.current)
    animFrameRef.current = requestAnimationFrame(() => drawMap(null))
  }, [drawMap])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const feature = getFeatureAtPoint(e.clientX - rect.left, e.clientY - rect.top)
    if (feature) {
      const code = getCountryCode(feature.properties)
      if (code && marketsRef.current[code]) {
        onCountryClick(code, String(feature.properties.name || code), e.clientX, e.clientY)
      }
    }
  }, [getFeatureAtPoint, onCountryClick])

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const touch = e.touches[0]
    if (touch) touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const touch = e.changedTouches[0]
    const start = touchStartRef.current
    if (!touch || !start) return
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (dx * dx + dy * dy > 225) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const feature = getFeatureAtPoint(touch.clientX - rect.left, touch.clientY - rect.top)
    if (feature) {
      const code = getCountryCode(feature.properties)
      if (code && marketsRef.current[code]) {
        onCountryClick(code, String(feature.properties.name || code), touch.clientX, touch.clientY)
      }
    }
    touchStartRef.current = null
  }, [getFeatureAtPoint, onCountryClick])

  return (
    <div ref={containerRef} className="w-full h-full relative bg-black">
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="block w-full h-full"
        style={{ touchAction: 'none' }}
      />
      <MarketTooltip tooltip={tooltip} />
    </div>
  )
}
