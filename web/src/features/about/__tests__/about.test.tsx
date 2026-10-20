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
import { LegalNotices } from '@/features/legal/notices'
import { api } from '@/lib/api'
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

async function renderAbout() {
  const root = createRootRoute({ component: Outlet })
  const about = createRoute({
    getParentRoute: () => root,
    path: '/about',
    component: About,
  })
  const notices = createRoute({
    getParentRoute: () => root,
    path: '/legal-notices',
    component: LegalNotices,
  })
  const router = createRouter({
    routeTree: root.addChildren([about, notices]),
    history: createMemoryHistory({ initialEntries: ['/about'] }),
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
}

test('the about and legal pages present Ai-Gateway and link to local license documents', async () => {
  const user = userEvent.setup()
  await renderAbout()

  expect(
    await screen.findByRole('heading', { name: 'Ai-Gateway' })
  ).toBeVisible()
  expect(screen.getByText('Maintained by Brandon')).toBeVisible()
  expect(
    screen.queryByText('New API Project Repository:')
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

  await user.click(screen.getByRole('button', { name: 'Legal Notices' }))

  expect(
    await screen.findByRole('heading', { name: 'Legal Notices' })
  ).toBeVisible()
  expect(
    screen.getByRole('heading', { name: 'Ai-Gateway', level: 2 })
  ).toBeVisible()
  expect(screen.getByText('Maintained by Brandon')).toBeVisible()
  expect(
    screen.queryByRole('heading', { name: 'New API' })
  ).not.toBeInTheDocument()
  expect(screen.queryByText(/QuantumNous/)).not.toBeInTheDocument()
  expect(
    screen
      .getAllByRole('link')
      .every(
        (link) =>
          !/github\.com\/(QuantumNous|songquanpeng)/i.test(
            link.getAttribute('href') ?? ''
          )
      )
  ).toBe(true)
  expect(
    screen.getByRole('link', { name: 'AGPL v3.0 License' })
  ).toHaveAttribute('href', '/LICENSE.txt')
  expect(screen.getByRole('link', { name: 'NOTICE' })).toHaveAttribute(
    'href',
    '/NOTICE.txt'
  )
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
    screen.queryByRole('heading', { name: 'Ai-Gateway' })
  ).not.toBeInTheDocument()
})
