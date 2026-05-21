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
}

interface GeoFeature {
  type: string
  properties: Record<string, unknown>
  geometry: Geometry
}

// GeoJSON properties에서 국가 코드 추출 (여러 필드 fallback)
function getCountryCode(props: Record<string, unknown>): string {
  const code = props.iso_a2 || props.ISO_A2 || props.adm0_a3 || ''
  return String(code).toUpperCase()
}

export default function WorldMap({ threatData }: WorldMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const geoDataRef = useRef<FeatureCollection | null>(null)
  const projectionRef = useRef<d3.GeoProjection | null>(null)
  const pathGeneratorRef = useRef<d3.GeoPath | null>(null)
  const hoveredCodeRef = useRef<string | null>(null)
  const animFrameRef = useRef<number>(0)

  const { selectCountry } = useAppStore()

  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false, x: 0, y: 0, countryName: '', threatLevel: 0,
  })

  const drawMap = useCallback((hoveredCode: string | null = null) => {
    const canvas = canvasRef.current
    const geo = geoDataRef.current
    const projection = projectionRef.current
    const pathGen = pathGeneratorRef.current
    if (!canvas || !geo || !projection || !pathGen) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // 배경
    ctx.fillStyle = '#03071E'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const features = geo.features as GeoFeature[]

    for (const feature of features) {
      const code = getCountryCode(feature.properties)
      const threat = threatData[code]
      const level = (threat?.threat_level ?? 0) as ThreatLevel
      const config = THREAT_CONFIG[level]
      const isHovered = code === hoveredCode

      const path2D = new Path2D(pathGen(feature as unknown as d3.GeoPermissibleObjects) || '')

      // fill
      ctx.save()
      ctx.shadowBlur = isHovered ? config.shadowBlur * 2 : config.shadowBlur
      ctx.shadowColor = config.glow
      ctx.fillStyle = config.fill
      ctx.fill(path2D)
      ctx.restore()

      // stroke (경계선)
      ctx.save()
      ctx.shadowBlur = isHovered ? 12 : 4
      ctx.shadowColor = THREAT_STROKE[level]
      ctx.strokeStyle = isHovered
        ? THREAT_STROKE[level]
        : level === 0 ? '#00B4D8' : THREAT_STROKE[level]
      ctx.lineWidth = (config.strokeWidth / (window.devicePixelRatio || 1)) * (isHovered ? 1.8 : 1)
      ctx.stroke(path2D)
      ctx.restore()
    }
  }, [threatData])

  // 리사이즈 + 초기 렌더
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

    drawMap(hoveredCodeRef.current)
  }, [drawMap])

  // GeoJSON 로드
  useEffect(() => {
    fetch('/data/world.geojson')
      .then((r) => r.json())
      .then((data: FeatureCollection) => {
        geoDataRef.current = data
        setupCanvas()
      })
  }, [setupCanvas])

  // threatData 변경 시 재렌더
  useEffect(() => {
    drawMap(hoveredCodeRef.current)
  }, [threatData, drawMap])

  // 리사이즈 감지
  useEffect(() => {
    const observer = new ResizeObserver(() => setupCanvas())
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [setupCanvas])

  // 마우스 이벤트
  const getFeatureAtPoint = useCallback((x: number, y: number): GeoFeature | null => {
    const geo = geoDataRef.current
    const projection = projectionRef.current
    if (!geo || !projection) return null

    const coords = projection.invert?.([x, y])
    if (!coords) return null

    for (const feature of geo.features as GeoFeature[]) {
      try {
        if (d3.geoContains(feature as unknown as d3.GeoPermissibleObjects, coords)) {
          return feature
        }
      } catch {
        // 일부 피처에서 에러 발생 가능, 무시
      }
    }
    return null
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const feature = getFeatureAtPoint(x, y)
    if (feature) {
      const code = getCountryCode(feature.properties)
      const threat = threatData[code]
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
      canvas.style.cursor = 'pointer'
    } else {
      if (hoveredCodeRef.current !== null) {
        hoveredCodeRef.current = null
        cancelAnimationFrame(animFrameRef.current)
        animFrameRef.current = requestAnimationFrame(() => drawMap(null))
      }
      setTooltip((prev) => ({ ...prev, visible: false }))
      canvas.style.cursor = 'default'
    }
  }, [getFeatureAtPoint, threatData, drawMap])

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
      if (code) {
        selectCountry(code, String(feature.properties.name || code))
      }
    }
  }, [getFeatureAtPoint, selectCountry])

  return (
    <div ref={containerRef} className="w-full h-full relative bg-[#03071E]">
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
