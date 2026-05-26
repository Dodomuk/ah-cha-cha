import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Lang } from './i18n'
import { translations } from './i18n'

interface LangState {
  lang: Lang
  setLang: (lang: Lang) => void
  t: typeof translations.ko
}

export const useLangStore = create<LangState>()(
  persist(
    (set) => ({
      lang: 'ko' as Lang,
      t: translations.ko,
      setLang: (lang) => set({ lang, t: translations[lang] }),
    }),
    { name: 'ahchacha-lang' }
  )
)
