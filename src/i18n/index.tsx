import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ar } from './ar'
import { fr } from './fr'

/**
 * Lightweight i18n without external dependencies, matching the zero-cost plan.
 * Translation keys are the English source strings, so a missing entry degrades
 * to English instead of showing a raw key. Add a language by creating a
 * dictionary file and registering it below.
 */
export type Language = 'en' | 'fr' | 'ar'

const dictionaries: Partial<Record<Language, Record<string, string>>> = { fr, ar }

export const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'ar', label: 'العربية' },
]

export const RTL_LANGUAGES: readonly Language[] = ['ar']

const STORAGE_KEY = 'bac.language'
const DATE_LOCALES: Record<Language, string> = { en: 'en-GB', fr: 'fr-MA', ar: 'ar-MA' }

function detectLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'fr' || stored === 'ar') return stored
  } catch { /* storage unavailable */ }
  const candidates = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []
  for (const candidate of candidates) {
    const base = candidate.slice(0, 2).toLowerCase()
    if (base === 'fr') return 'fr'
    if (base === 'ar') return 'ar'
  }
  return 'en'
}

type I18nValue = {
  language: Language
  setLanguage: (language: Language) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(detectLanguage)

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = RTL_LANGUAGES.includes(language) ? 'rtl' : 'ltr'
    try { localStorage.setItem(STORAGE_KEY, language) } catch { /* storage unavailable */ }
  }, [language])

  const setLanguage = useCallback((next: Language) => setLanguageState(next), [])

  const value = useMemo<I18nValue>(() => ({
    language,
    setLanguage,
    t: (key, vars) => {
      let text = language === 'en' ? key : dictionaries[language]?.[key] ?? key
      if (vars) for (const [name, entry] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(entry))
      return text
    },
  }), [language, setLanguage])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside I18nProvider')
  return value
}

/** Intl locale used by the shared date/money formatters; updated with the language. */
export function localeFor(language: Language): string {
  return DATE_LOCALES[language]
}
