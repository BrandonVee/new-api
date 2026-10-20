/**
 * Application-wide constants
 */

// System Configuration Defaults
export const DEFAULT_SYSTEM_NAME = 'Ai-Gateway'
export const DEFAULT_LOGO = '/ai-gateway-logo.png'
export const PROJECT_MAINTAINER = 'Brandon'

export function resolveDocsLink(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '/'
  const link = value.trim()
  if (link.startsWith('/') && !link.startsWith('//')) return link

  try {
    const url = new URL(link)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      /(^|\.)newapi\.(pro|ai)$/i.test(url.hostname)
    ) {
      return '/'
    }
    return link
  } catch {
    return '/'
  }
}

export function resolveSystemLogo(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value === '/logo.png') {
    return DEFAULT_LOGO
  }
  return value
}

export function resolveSystemName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return DEFAULT_SYSTEM_NAME
  if (['new api', 'newapi', 'new-api'].includes(value.trim().toLowerCase())) {
    return DEFAULT_SYSTEM_NAME
  }
  return value
}

// LocalStorage Keys
export const STORAGE_KEYS = {
  SYSTEM_NAME: 'system_name',
  LOGO: 'logo',
  FOOTER_HTML: 'footer_html',
} as const
