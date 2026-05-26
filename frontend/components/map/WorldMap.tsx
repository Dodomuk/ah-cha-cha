'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import * as d3 from 'd3'
import { FeatureCollection, Geometry } from 'geojson'
import { CountryThreat, TooltipState, ThreatLevel } from '@/types'
import { THREAT_CONFIG, THREAT_STROKE } from '@/lib/threatColors'
import { useAppStore } from '@/lib/store'
import MapTooltip from './MapTooltip'

interface WorldMapProps {
  threatData: Record<string, CountryThreat>
  dateKey: string
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

export default function WorldMap({ threatData, dateKey }: WorldMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const geoDataRef = useRef<FeatureCollection | null>(null)
  const projectionRef = useRef<d3.GeoProjection | null>(null)
  const pathGeneratorRef = useRef<d3.GeoPath | null>(null)
  const hoveredCodeRef = useRef<string | null>(null)
  const animFrameRef = useRef<number>(0)
  const pathCacheRef = useRef<Map<number, Path2D>>(new Map())
  const lastMouseRef = useRef({ time: 0, x: -999, y: -999 })

  // Ref로 threatData를 보관해 drawMap을 안정적(stable)으로 유지
  // → threatData가 바뀌어도 GeoJSON 재요청·setupCanvas 재실행이 발생하지 않음
  const threatDataRef = useRef(threatData)

  const { selectCountry, closePanel } = useAppStore()

  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false, x: 0, y: 0, countryName: '', threatLevel: 0,
  })


  // drawMap은 deps 없이 stable — threatData는 ref에서 읽음
  const drawMap = useCallback((hoveredCode: string | null = null) => {
    const canvas = canvasRef.current
    const geo = geoDataRef.current
    const projection = projectionRef.current
    const pathGen = pathGeneratorRef.current
    if (!canvas || !geo || !projection || !pathGen) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const td = threatDataRef.current

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const features = geo.features as GeoFeature[]

    for (let i = 0; i < features.length; i++) {
      const feature = features[i]
      const code = getCountryCode(feature.properties)
      const threat = td[code]
      const hasData = !!threat
      const level = (threat?.threat_level ?? 0) as ThreatLevel
      const config = THREAT_CONFIG[level]
      const isHovered = code === hoveredCode

      let path2D = pathCacheRef.current.get(i)
      if (!path2D) {
        path2D = new Path2D(pathGen(feature as unknown as d3.GeoPermissibleObjects) || '')
        pathCacheRef.current.set(i, path2D)
      }

      ctx.save()
      if (hasData) {
        ctx.shadowBlur = isHovered ? config.shadowBlur * 2 : config.shadowBlur
        ctx.shadowColor = config.glow
      }
      ctx.fillStyle = isHovered && !hasData ? '#181818' : config.fill
      ctx.fill(path2D)
      ctx.restore()

      ctx.save()
      if (hasData && isHovered) {
        ctx.shadowBlur = 12
        ctx.shadowColor = THREAT_STROKE[level]
        ctx.strokeStyle = THREAT_STROKE[level]
        ctx.lineWidth = (config.strokeWidth / (window.devicePixelRatio || 1)) * 1.8
      } else if (hasData) {
        ctx.shadowBlur = 4
        ctx.shadowColor = THREAT_STROKE[level]
        ctx.strokeStyle = THREAT_STROKE[level]
        ctx.lineWidth = config.strokeWidth / (window.devicePixelRatio || 1)
      } else {
        ctx.strokeStyle = '#1e2a2a'
        ctx.lineWidth = 0.4 / (window.devicePixelRatio || 1)
      }
      ctx.stroke(path2D)
      ctx.restore()
    }
  }, []) // stable — threatData는 ref에서 직접 읽음

  // setupCanvas도 stable (drawMap이 stable이므로)
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

    const projection = d3.geoNaturalEarth1()
      .scale(w / 6.5)
      .translate([w / 2, h / 2])

    projectionRef.current = projection
    pathGeneratorRef.current = d3.geoPath().projection(projection)
    pathCacheRef.current.clear()

    drawMap(hoveredCodeRef.current)
  }, [drawMap])

  // GeoJSON은 마운트 시 단 1회만 로드 (setupCanvas가 stable이므로 재실행 없음)
  useEffect(() => {
    fetch('/data/world.geojson')
      .then((r) => r.json())
      .then((data: FeatureCollection) => {
        geoDataRef.current = data
        setupCanvas()
      })
  }, [setupCanvas])

  // threatData·dateKey가 바뀔 때 지도를 다시 그림
  useEffect(() => {
    threatDataRef.current = threatData
    if (!geoDataRef.current) return
    drawMap(hoveredCodeRef.current)
  }, [threatData, dateKey, drawMap])

  useEffect(() => {
    const observer = new ResizeObserver(() => setupCanvas())
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [setupCanvas])

  // isPointInPath hit test: CTM(DPR scale)을 리셋해 CSS 픽셀 좌표로 정확히 판정
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
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const feature = getFeatureAtPoint(x, y)
    if (feature) {
      const code = getCountryCode(feature.properties)
      const threat = threatDataRef.current[code]
      const hasData = !!threat
      const level = (threat?.threat_level ?? 0) as ThreatLevel

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
        threatLevel: level,
      })
      canvas.style.cursor = hasData ? 'pointer' : 'default'
    } else {
      if (hoveredCodeRef.current !== null) {
        hoveredCodeRef.current = null
        cancelAnimationFrame(animFrameRef.current)
        animFrameRef.current = requestAnimationFrame(() => drawMap(null))
      }
      setTooltip((prev) => ({ ...prev, visible: false }))
      canvas.style.cursor = 'default'
    }
  }, [getFeatureAtPoint, drawMap])

  const handleMouseLeave = useCallback(() => {
    hoveredCodeRef.current = null
    setTooltip((prev) => ({ ...prev, visible: false }))
    cancelAnimationFrame(animFrameRef.current)
    animFrameRef.current = requestAnimationFrame(() => drawMap(null))
  }, [drawMap])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const feature = getFeatureAtPoint(x, y)
    if (feature) {
      const code = getCountryCode(feature.properties)
      const hasData = !!threatDataRef.current[code]
      if (code && hasData) {
        selectCountry(code, String(feature.properties.name || code), e.clientX, e.clientY)
      }
    } else {
      closePanel()
    }
  }, [getFeatureAtPoint, selectCountry, closePanel])

  return (
    <div ref={containerRef} className="w-full h-full relative bg-black">
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        className="block w-full h-full"
      />
      <MapTooltip tooltip={tooltip} />
    </div>
  )
}
