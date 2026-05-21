import { create } from 'zustand'

interface AppState {
  selectedCountryCode: string | null
  selectedCountryName: string | null
  isPanelOpen: boolean
  selectCountry: (code: string, name: string) => void
  closePanel: () => void
}

export const useAppStore = create<AppState>((set) => ({
  selectedCountryCode: null,
  selectedCountryName: null,
  isPanelOpen: false,
  selectCountry: (code, name) =>
    set({ selectedCountryCode: code, selectedCountryName: name, isPanelOpen: true }),
  closePanel: () =>
    set({ isPanelOpen: false, selectedCountryCode: null, selectedCountryName: null }),
}))
