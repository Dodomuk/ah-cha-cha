'use client'

import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

interface Arrow {
  from: string
  to: string
  type: string
}

interface AnimationConfig {
  affected_countries: string[]
  arrows: Arrow[]
  threat_level: number
  icon: string
  category: string
}

interface EventMapProps {
  title: string
  countries: string[]
  animationConfig?: string
  threatLevel: number
}

const countryCoordinates: Record<string, [number, number]> = {
  US: [-95, 37], CA: [-106, 56], MX: [-102, 23], BR: [-51, -14], AR: [-63, -38],
  GB: [-3, 54], FR: [2, 46], DE: [10, 51], IT: [12, 42], ES: [-3, 40],
  RU: [105, 61], CN: [105, 35], IN: [78, 20], JP: [138, 36], KR: [127, 37],
  AU: [133, -25], NZ: [174, -40], SG: [103, 1], TH: [100, 15], PH: [122, 12],
  TR: [35, 39], SA: [45, 24], AE: [54, 24], IL: [35, 31], EG: [30, 26],
  ZA: [24, -30], NG: [8, 9], KE: [-36, 0], CO: [-74, 4],
  CL: [-71, -30], PE: [-75, -9], VE: [-66, 6], SE: [15, 60], NO: [8, 60],
  NL: [5, 52], BE: [4, 50], CH: [8, 47], AT: [14, 48], PL: [19, 52],
  CZ: [15, 49], HU: [19, 47], RO: [25, 46], UA: [32, 48], MY: [101, 4],
  ID: [113, -2], VN: [105, 16], BD: [90, 24], PK: [69, 30], AF: [67, 33],
  IR: [53, 32], IQ: [44, 33], SY: [36, 34], LB: [35, 34], JO: [35, 31],
  PS: [35, 32], DZ: [2, 28], TN: [9, 35], MA: [-5, 31], UG: [32, 1],
  TZ: [35, -6], RW: [30, -2], BW: [24, -22], ZM: [28, -13], ZW: [29, -19],
  MW: [34, -13], MZ: [35, -18], AO: [17, -11], CG: [24, -4], CD: [23, -5],
  GA: [13, -1], CM: [12, 3], GH: [-2, 7], CI: [-6, 7], BJ: [2, 9],
  TG: [1, 6], SL: [-11, 8], LR: [-10, 6], GMB: [-15, 13], SN: [-14, 14],
  ML: [-7, 18], MR: [-10, 21], SD: [30, 15], ET: [40, 9], SO: [46, 10],
  DJ: [42, 11], ER: [39, 15], SS: [31, 6], LS: [28, -30], SZ: [31, -26],
  MG: [47, -20], MU: [57, -20], SC: [55, -4],
}

export default function EventMap({ title, countries, animationConfig, threatLevel }: EventMapProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  const threatColor = (level: number) => {
    if (level >= 4) return '#ff5252'
    if (level >= 3) return '#ff9100'
    if (level >= 2) return '#ffc107'
    return '#4caf50'
  }

  useEffect(() => {
    const loadAndRender = async () => {
      try {
        const width = 380
        const height = 250
        const svg = d3.select(svgRef.current)
        svg.selectAll('*').remove()

        svg
          .attr('width', width)
          .attr('height', height)
          .style('background', '#0a0a0a')

        const g = svg.append('g')
        const projection = d3.geoMercator().fitSize([width, height], { type: 'Point', coordinates: [0, 20] } as any)

        let config: AnimationConfig | null = null
        if (animationConfig) {
          try {
            config = JSON.parse(animationConfig)
          } catch (e) {
            console.error('Failed to parse animation config:', e)
          }
        }

        const affectedCountries = config?.affected_countries || countries
        const color = threatColor(threatLevel)

        affectedCountries.forEach((code: string) => {
          const coord = countryCoordinates[code]
          if (coord) {
            const projected = projection(coord as any)
            if (projected) {
              g.append('circle')
                .attr('cx', projected[0])
                .attr('cy', projected[1])
                .attr('r', 6)
                .attr('fill', color)
                .attr('opacity', 0.8)
                .attr('stroke', '#fff')
                .attr('stroke-width', 1)
            }
          }
        })

        if (config?.arrows && config.arrows.length > 0) {
          const defs = g.append('defs')

          defs
            .append('marker')
            .attr('id', 'arrowhead')
            .attr('markerWidth', 10)
            .attr('markerHeight', 10)
            .attr('refX', 9)
            .attr('refY', 3)
            .attr('orient', 'auto')
            .append('polygon')
            .attr('points', '0 0, 10 3, 0 6')
            .attr('fill', color)

          config.arrows.forEach((arrow: Arrow, idx: number) => {
            const fromCoord = countryCoordinates[arrow.from]
            const toCoord = countryCoordinates[arrow.to]

            if (fromCoord && toCoord) {
              const fromProj = projection(fromCoord as any)
              const toProj = projection(toCoord as any)

              if (fromProj && toProj) {
                const midX = (fromProj[0] + toProj[0]) / 2
                const midY = (fromProj[1] + toProj[1]) / 2 - 40

                const pathData = `M ${fromProj[0]} ${fromProj[1]} Q ${midX} ${midY} ${toProj[0]} ${toProj[1]}`

                const line = g
                  .append('path')
                  .attr('d', pathData)
                  .attr('stroke', color)
                  .attr('stroke-width', 2)
                  .attr('fill', 'none')
                  .attr('marker-end', 'url(#arrowhead)')
                  .attr('opacity', 0.6)

                const totalLength = (line.node() as SVGPathElement)?.getTotalLength() || 0
                line
                  .attr('stroke-dasharray', totalLength)
                  .attr('stroke-dashoffset', totalLength)
                  .transition()
                  .duration(1000)
                  .delay(idx * 200)
                  .attr('stroke-dashoffset', 0)
              }
            }
          })
        }

        const legend = svg
          .append('g')
          .attr('transform', 'translate(12, 12)')

        legend
          .append('text')
          .attr('x', 0)
          .attr('y', 0)
          .attr('fill', '#fff')
          .attr('font-size', '11px')
          .attr('font-weight', '600')
          .text(title.substring(0, 30))

        legend
          .append('text')
          .attr('x', 0)
          .attr('y', 16)
          .attr('fill', color)
          .attr('font-size', '10px')
          .text(`Level ${threatLevel}`)
      } catch (error) {
        console.error('Failed to render map:', error)
      }
    }

    loadAndRender()
  }, [countries, animationConfig, threatLevel, title])

  return (
    <div style={{ width: '100%', display: 'flex', justifyContent: 'center', marginTop: 12 }}>
      <svg
        ref={svgRef}
        style={{
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6,
          maxWidth: '100%',
          height: 'auto',
        }}
      />
    </div>
  )
}
