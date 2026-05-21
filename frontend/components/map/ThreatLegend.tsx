'use client'

import { THREAT_STROKE, THREAT_LABEL } from '@/lib/threatColors'
import { ThreatLevel } from '@/types'

export default function ThreatLegend() {
  const levels: ThreatLevel[] = [4, 3, 2, 1, 0]

  return (
    <div
      className="absolute bottom-6 left-6 rounded p-3 text-xs space-y-1.5"
      style={{
        background: 'rgba(13,27,42,0.85)',
        border: '1px solid #00B4D820',
        fontFamily: 'monospace',
      }}
    >
      <div className="text-[#7FBBCC] mb-2 text-[10px] tracking-widest uppercase">
        위협 레벨
      </div>
      {levels.map((level) => (
        <div key={level} className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-sm flex-shrink-0"
            style={{
              background: THREAT_STROKE[level],
              boxShadow: `0 0 6px ${THREAT_STROKE[level]}`,
            }}
          />
          <span style={{ color: THREAT_STROKE[level] }}>
            {level} — {THREAT_LABEL[level]}
          </span>
        </div>
      ))}
    </div>
  )
}
