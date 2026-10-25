import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useStatus } from '@/hooks/use-status'
import { KAIMING_ENERGY_WEBSITE_URL, resolveDocsLink } from '@/lib/constants'
import { parseHeaderNavModulesFromStatus } from '@/lib/nav-modules'
import { useAuthStore } from '@/stores/auth-store'

export type TopNavLink = {
  title: string
  href: string
  disabled?: boolean
  requiresAuth?: boolean
  external?: boolean
}

/**
 * Generate top navigation links based on HeaderNavModules configuration from backend /api/status
 * Backend format example (stringified JSON):
 * {
 *   home: true,
 *   console: true,
 *   pricing: { enabled: true, requireAuth: false },
 *   rankings: { enabled: true, requireAuth: false },
 *   docs: true,
 *   about: true
 * }
 */
export function useTopNavLinks(): TopNavLink[] {
  const { t } = useTranslation()
  const { status } = useStatus()
  const { auth } = useAuthStore()

  // Parse HeaderNavModules
  const modules = useMemo(() => {
    return parseHeaderNavModulesFromStatus(
      status as Record<string, unknown> | null
    )
  }, [status])

  // Documentation link (may be external)
  const docsLink = resolveDocsLink(status?.docs_link)

  const isAuthed = !!auth?.user

  const links: TopNavLink[] = [
    {
      title: t('Official website'),
      href: KAIMING_ENERGY_WEBSITE_URL,
      external: true,
    },
  ]

  // Home
  if (modules?.home !== false) {
    links.push({ title: t('TOKEN Home'), href: '/' })
  }

  // Pricing
  const pricing = modules?.pricing
  if (pricing && typeof pricing === 'object' && pricing.enabled) {
    const requiresAuth = pricing.requireAuth && !isAuthed
    links.push({ title: t('Model Square'), href: '/pricing', requiresAuth })
  }

  // Rankings
  const rankings = modules?.rankings
  if (rankings && typeof rankings === 'object' && rankings.enabled) {
    const requiresAuth = rankings.requireAuth && !isAuthed
    links.push({ title: t('Rankings'), href: '/rankings', requiresAuth })
  }

  // Docs (supports external links)
  if (modules?.docs !== false) {
    links.push({
      title: t('Docs'),
      href: docsLink,
      external: docsLink.startsWith('http'),
    })
  }

  // About
  if (modules?.about !== false) {
    links.push({ title: t('About'), href: '/about' })
  }

  // Console -> /dashboard (new console path)
  if (modules?.console !== false) {
    links.push({ title: t('Console'), href: '/dashboard' })
  }

  return links
}
