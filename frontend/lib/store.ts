import { create } from 'zustand'

interface ClickPosition {
  x: number
  y: number
}

export interface DateRange {
  start: string  // YYYY-MM-DD KST
  end: string    // YYYY-MM-DD KST
}

function todayKST(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

function defaultStart(): string {
  return new Date(Date.now() + 9 * 3600 * 1000 - 6 * 86400 * 1000).toISOString().slice(0, 10)
}

interface AppState {
  selectedCountryCode: string | null
  selectedCountryName: string | null
  isPanelOpen: boolean
  clickPosition: ClickPosition | null
  dateRange: DateRange
  selectCountry: (code: string, name: string, x: number, y: number) => void
  closePanel: () => void
  setDateRange: (range: DateRange) => void
}

export const useAppStore = create<AppState>((set) => ({
  selectedCountryCode: null,
  selectedCountryName: null,
  isPanelOpen: false,
  clickPosition: null,
  dateRange: { start: defaultStart(), end: todayKST() },
  selectCountry: (code, name, x, y) =>
    set({ selectedCountryCode: code, selectedCountryName: name, isPanelOpen: true, clickPosition: { x, y } }),
  closePanel: () =>
    set({ isPanelOpen: false, selectedCountryCode: null, selectedCountryName: null, clickPosition: null }),
  setDateRange: (dateRange) => set({ dateRange }),
}))
