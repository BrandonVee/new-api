export const THEME_STORAGE_KEYS = {
  mode: 'ai-gateway:theme:v1:mode',
  preset: 'ai-gateway:theme:v1:preset',
  font: 'ai-gateway:theme:v1:font',
  radius: 'ai-gateway:theme:v1:radius',
  scale: 'ai-gateway:theme:v1:scale',
  contentLayout: 'ai-gateway:theme:v1:content-layout',
} as const

export function readThemePreference<T extends string>(
  key: string,
  allowed: ReadonlySet<T>,
  fallback: T
): T {
  if (typeof window === 'undefined') return fallback

  try {
    const value = window.localStorage.getItem(key)
    return value && allowed.has(value as T) ? (value as T) : fallback
  } catch {
    return fallback
  }
}

export function writeThemePreference(key: string, value: string | null): void {
  if (typeof window === 'undefined') return

  try {
    if (value === null) {
      window.localStorage.removeItem(key)
    } else {
      window.localStorage.setItem(key, value)
    }
  } catch {
    // Keep theme controls usable when storage is blocked or full.
  }
}
