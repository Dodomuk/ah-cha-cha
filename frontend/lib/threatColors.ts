import { ThreatLevel } from '@/types'

export const THREAT_CONFIG: Record<ThreatLevel, {
  label: string
  fill: string
  glow: string
  strokeWidth: number
  shadowBlur: number
  badge: string
}> = {
  0: {
    label: '이상 없음',
    fill: '#050A1A',
    glow: '#0077B6',
    strokeWidth: 0.5,
    shadowBlur: 6,
    badge: 'bg-sky-900 text-sky-300',
  },
  1: {
    label: 'Low — 경미한 위협',
    fill: '#0D2B0D',
    glow: '#00FF00',
    strokeWidth: 0.8,
    shadowBlur: 10,
    badge: 'bg-green-900 text-green-300',
  },
  2: {
    label: 'Medium — 보안 위협',
    fill: '#2B2000',
    glow: '#FFC000',
    strokeWidth: 0.8,
    shadowBlur: 14,
    badge: 'bg-yellow-900 text-yellow-300',
  },
  3: {
    label: 'High — 심각한 위협',
    fill: '#2B1000',
    glow: '#FF6B00',
    strokeWidth: 1,
    shadowBlur: 18,
    badge: 'bg-orange-900 text-orange-300',
  },
  4: {
    label: 'Critical — 최고 위협',
    fill: '#2B0000',
    glow: '#FF0000',
    strokeWidth: 1.2,
    shadowBlur: 22,
    badge: 'bg-red-900 text-red-400',
  },
}

export const THREAT_STROKE: Record<ThreatLevel, string> = {
  0: '#00B4D8',
  1: '#39FF14',
  2: '#FFD700',
  3: '#FF8C00',
  4: '#FF2D2D',
}

export const THREAT_LABEL: Record<ThreatLevel, string> = {
  0: 'None',
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Critical',
}
