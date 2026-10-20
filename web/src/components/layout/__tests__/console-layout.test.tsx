import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Button } from '@/components/ui/button'
import { DirectionProvider } from '@/context/direction-provider'
import { ThemeCustomizationProvider } from '@/context/theme-customization-provider'
import { ThemeProvider } from '@/context/theme-provider'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { AuthenticatedLayout } from '../components/authenticated-layout'
import { PageFooterPortal } from '../components/page-footer'
import { SectionPageLayout } from '../components/section-page-layout'

let client: QueryClient

function ConsolePage(props: { fixedContent: boolean; title: string }) {
  return (
    <SectionPageLayout fixedContent={props.fixedContent}>
      <SectionPageLayout.Title>{props.title}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button>Page action</Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <section aria-label='Page data'>Table and filter content</section>
        <PageFooterPortal>
          <Button>Next page</Button>
        </PageFooterPortal>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

async function renderConsole(fixedContent = true) {
  const root = createRootRoute({ component: AuthenticatedLayout })
  const keys = createRoute({
    getParentRoute: () => root,
    path: '/keys',
    component: () => (
      <ConsolePage fixedContent={fixedContent} title='API Keys' />
    ),
  })
  const logs = createRoute({
    getParentRoute: () => root,
    path: '/usage-logs/common',
    component: () => (
      <ConsolePage fixedContent={fixedContent} title='Usage Logs' />
    ),
  })
  const router = createRouter({
    routeTree: root.addChildren([keys, logs]),
    history: createMemoryHistory({ initialEntries: ['/keys'] }),
  })
  await router.load()
  return render(
    <QueryClientProvider client={client}>
      <DirectionProvider>
        <ThemeProvider>
          <ThemeCustomizationProvider>
            <RouterProvider router={router} />
          </ThemeCustomizationProvider>
        </ThemeProvider>
      </DirectionProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  useAuthStore.getState().auth.setUser({ id: 1, username: 'preview', role: 1 })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['status'], { system_name: 'Ai-Gateway' })
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: '' } })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  client.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  window.localStorage.clear()
  for (const cookie of document.cookie.split(';')) {
    document.cookie = `${cookie.trim().split('=')[0]}=; path=/; max-age=0`
  }
  document.documentElement.classList.remove('light', 'dark')
  for (const name of document.body.getAttributeNames()) {
    if (name.startsWith('data-theme-')) document.body.removeAttribute(name)
  }
})

describe('console layout', () => {
  it('does not check upstream releases or expose an update action for an administrator', async () => {
    const fetchRelease = vi
      .fn()
      .mockRejectedValue(new Error('Unexpected release request'))
    vi.stubGlobal('fetch', fetchRelease)
    useAuthStore
      .getState()
      .auth.setUser({ id: 1, username: 'admin', role: 100 })

    await renderConsole()

    expect(screen.getByRole('heading', { name: 'API Keys' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /System updates|Check for updates/ })
    ).not.toBeInTheDocument()
    expect(fetchRelease).not.toHaveBeenCalled()
  })

  it.each([true, false])(
    'keeps pagination outside the content scroll area when fixedContent is %s',
    async (fixedContent) => {
      await renderConsole(fixedContent)
      const data = screen.getByRole('region', { name: 'Page data' })
      const content = data.closest('[data-slot="page-content"]')
      const pagination = screen.getByRole('button', { name: 'Next page' })

      expect(content).toHaveClass(
        fixedContent ? 'overflow-hidden' : 'overflow-auto'
      )
      expect(content).not.toContainElement(pagination)
      expect(pagination.closest('[data-slot="page-footer"]')).toBeVisible()
      expect(screen.getByRole('button', { name: 'Page action' })).toBeVisible()
    }
  )

  it('preserves active navigation while collapsing and expanding the desktop sidebar', async () => {
    const user = userEvent.setup()
    await renderConsole()
    const active = screen.getByRole('link', { name: 'API Keys' })
    const sidebar = active.closest('[data-slot="sidebar"]')
    expect(active).toHaveAttribute('data-active')

    await user.click(
      within(screen.getByRole('banner')).getByRole('button', {
        name: 'Toggle Sidebar',
      })
    )

    expect(sidebar).toHaveAttribute('data-state', 'collapsed')
    expect(screen.getByRole('heading', { name: 'API Keys' })).toBeVisible()
    await user.keyboard('{Control>}b{/Control}')
    expect(sidebar).toHaveAttribute('data-state', 'expanded')
    expect(active).toHaveAttribute('data-active')
  })

  it('opens mobile navigation and closes it after navigating to another page', async () => {
    vi.stubGlobal('innerWidth', 390)
    const user = userEvent.setup()
    await renderConsole()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(
      within(screen.getByRole('banner')).getByRole('button', {
        name: 'Toggle Sidebar',
      })
    )
    const drawer = await screen.findByRole('dialog')
    await user.click(within(drawer).getByRole('link', { name: 'Usage Logs' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    expect(
      await screen.findByRole('heading', { name: 'Usage Logs' })
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Page action' })).toBeVisible()
  })
})
