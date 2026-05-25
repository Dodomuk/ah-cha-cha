import { create } from 'zustand'

interface ClickPosition {
  x: number
  y: number
}

interface AppState {
  selectedCountryCode: string | null
  selectedCountryName: string | null
  isPanelOpen: boolean
  clickPosition: ClickPosition | null
  selectCountry: (code: string, name: string, x: number, y: number) => void
  closePanel: () => void
}

export const useAppStore = create<AppState>((set) => ({
  selectedCountryCode: null,
  selectedCountryName: null,
  isPanelOpen: false,
  clickPosition: null,
  selectCountry: (code, name, x, y) =>
    set({ selectedCountryCode: code, selectedCountryName: name, isPanelOpen: true, clickPosition: { x, y } }),
  closePanel: () =>
    set({ isPanelOpen: false, selectedCountryCode: null, selectedCountryName: null, clickPosition: null }),
}))
