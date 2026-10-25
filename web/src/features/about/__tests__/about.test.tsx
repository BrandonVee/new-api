import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { DirectionProvider } from '@/context/direction-provider'
import { ThemeProvider } from '@/context/theme-provider'
import { UsageGuidelines } from '@/features/legal/usage-guidelines'
import { api } from '@/lib/api'
import { Route as LegalNoticesRoute } from '@/routes/legal-notices'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { About } from '..'

let client: QueryClient

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(['status'], { docs_link: 'https://docs.newapi.pro' })
  client.setQueryData(['notice'], { success: true, data: '' })
  client.setQueryData(['about-content'], { success: true, data: '' })
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: '' } })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  client.clear()
  vi.restoreAllMocks()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  localStorage.clear()
  document.documentElement.classList.remove('light', 'dark')
})

async function renderAbout(initialEntry = '/about') {
  const root = createRootRoute({ component: Outlet })
  const about = createRoute({
    getParentRoute: () => root,
    path: '/about',
    component: About,
  })
  const guidelines = createRoute({
    getParentRoute: () => root,
    path: '/usage-guidelines',
    component: UsageGuidelines,
  })
  const notices = createRoute({
    getParentRoute: () => root,
    path: '/legal-notices',
    beforeLoad: LegalNoticesRoute.options.beforeLoad as () => void,
  })
  const router = createRouter({
    routeTree: root.addChildren([about, guidelines, notices]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <DirectionProvider>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </DirectionProvider>
    </QueryClientProvider>
  )
  return router
}

test('about links to usage guidelines without exposing maintainer details or license notices', async () => {
  const user = userEvent.setup()
  await renderAbout()

  expect(
    await screen.findByRole('heading', { name: 'Ai-gateway' })
  ).toBeVisible()
  expect(screen.queryByText(/Brandon|Maintained by/)).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Legal Notices' })
  ).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Usage Guidelines' }))

  expect(
    await screen.findByRole('heading', { name: 'Usage Guidelines' })
  ).toBeVisible()
  for (const heading of [
    'Authorized use',
    'Protect your account and API keys',
    'Respect service limits',
    'Protect privacy and respect others’ rights',
    'Use AI outputs responsibly',
  ]) {
    expect(screen.getByRole('heading', { name: heading })).toBeVisible()
  }
  expect(
    screen.queryByText(/Brandon|Maintained by|AGPL|NOTICE|Third-Party Licenses/)
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('link', { name: 'AGPL v3.0 License' })
  ).not.toBeInTheDocument()
  expect(
    screen
      .getAllByRole('link')
      .every(
        (link) =>
          !/github\.com\/(QuantumNous|songquanpeng)|docs\.newapi/i.test(
            link.getAttribute('href') ?? ''
          )
      )
  ).toBe(true)
})

test('the former legal notice address redirects to usage guidelines', async () => {
  const router = await renderAbout('/legal-notices')
  expect(
    await screen.findByRole('heading', { name: 'Usage Guidelines' })
  ).toBeVisible()
  expect(router.state.location.pathname).toBe('/usage-guidelines')
  expect(
    screen.queryByRole('heading', { name: 'Legal Notices' })
  ).not.toBeInTheDocument()
})

test('administrator-supplied about content remains available', async () => {
  client.setQueryData(['about-content'], {
    success: true,
    data: '# Our gateway\n\nManaged by our own team.',
  })

  await renderAbout()

  expect(
    await screen.findByRole('heading', { name: 'Our gateway' })
  ).toBeVisible()
  expect(screen.getByText('Managed by our own team.')).toBeVisible()
  expect(
    screen.queryByRole('heading', { name: 'Ai-gateway' })
  ).not.toBeInTheDocument()
})
