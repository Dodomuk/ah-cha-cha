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
      lang: 'en' as Lang,
      t: translations.en,
      setLang: (lang) => set({ lang, t: translations[lang] }),
    }),
    {
      name: 'ahchacha-lang',
      // lang 문자열만 저장, t는 함수 포함이라 JSON으로 직렬화 불가
      partialize: (state) => ({ lang: state.lang }),
      // 복원 시 lang 기반으로 t를 다시 파생
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.t = translations[state.lang]
        }
      },
    }
  )
)
