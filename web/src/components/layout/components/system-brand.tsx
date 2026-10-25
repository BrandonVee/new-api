import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { DEFAULT_LOGO, resolveSystemName } from '@/lib/constants'
import { cn } from '@/lib/utils'

type SystemBrandProps = {
  defaultName?: string
  defaultVersion?: string
  /**
   * Visual layout:
   * - 'sidebar': stacked card style (used inside the sidebar header).
   * - 'inline': compact horizontal pill (used inside the top app bar).
   */
  variant?: 'sidebar' | 'inline'
}

/**
 * System brand component
 * Displays current system logo + name.
 * - inline: compact pill in the top app bar; clicking navigates to home (/)
 * - sidebar: stacked card in the sidebar header (display only)
 */
export function SystemBrand(props: SystemBrandProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const { logo } = useSystemConfig()

  const variant = props.variant ?? 'sidebar'
  const name = resolveSystemName(status?.system_name || props.defaultName)
  const version =
    status?.version || props.defaultVersion || t('Unknown version')

  if (variant === 'inline') {
    return (
      <Link
        to='/'
        aria-label={t('Go to home')}
        className={cn(
          'text-foreground inline-flex h-9 min-w-0 items-center gap-2 rounded-lg px-1.5 text-sm font-semibold transition-colors outline-none select-none',
          'hover:bg-accent focus-visible:ring-ring/40 focus-visible:ring-2'
        )}
      >
        <div
          className={cn(
            'flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md',
            logo === DEFAULT_LOGO && 'rounded-none'
          )}
        >
          <img
            src={logo}
            alt={t('Logo')}
            className={cn(
              'size-full rounded-md object-cover',
              logo === DEFAULT_LOGO && 'rounded-none object-contain'
            )}
          />
        </div>
        <span className='max-w-[12rem] truncate'>{name}</span>
      </Link>
    )
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size='lg'
          className='hover:text-sidebar-foreground active:text-sidebar-foreground cursor-default hover:bg-transparent active:bg-transparent'
          render={<div />}
        >
          <div
            className={cn(
              'flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg',
              logo === DEFAULT_LOGO && 'rounded-none'
            )}
          >
            <img
              src={logo}
              alt={t('Logo')}
              className={cn(
                'size-full rounded-lg object-cover',
                logo === DEFAULT_LOGO && 'rounded-none object-contain'
              )}
            />
          </div>
          <div className='grid flex-1 text-start text-sm leading-tight group-data-[collapsible=icon]:hidden'>
            <span className='truncate font-semibold'>{name}</span>
            <span className='truncate text-xs'>{version}</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
