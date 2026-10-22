import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DirectionProvider } from '@/context/direction-provider'
import zh from '@/i18n/locales/zh.json'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { Rankings } from '..'
import { getRankings } from '../api'
import type { RankingsSnapshot } from '../types'

// jsdom has no canvas renderer. Keep the page/data flow real and stub only
// the third-party chart engine at that browser boundary.
vi.mock('@visactor/react-vchart', () => ({ VChart: () => null }))
vi.mock('@visactor/vchart', () => ({
  ThemeManager: { setCurrentTheme: vi.fn() },
}))

let client: QueryClient

const emptySnapshot: RankingsSnapshot = {
  models: [],
  vendors: [],
  top_movers: [],
  top_droppers: [],
  models_history: { points: [], models: [], buckets: 0 },
  vendor_share_history: { points: [], vendors: [], buckets: 0 },
}

async function renderRankings() {
  const root = createRootRoute()
  const rankings = createRoute({
    getParentRoute: () => root,
    path: '/rankings/',
    component: Rankings,
  })
  const router = createRouter({
    routeTree: root.addChildren([rankings]),
    history: createMemoryHistory({ initialEntries: ['/rankings'] }),
  })
  await router.load()
  return render(
    <QueryClientProvider client={client}>
      <DirectionProvider>
        <RouterProvider router={router} />
      </DirectionProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['status'], { system_name: 'Ai-gateway' })
  client.setQueryData(['notice'], { success: true, data: '' })
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

afterEach(async () => {
  cleanup()
  client.clear()
  vi.restoreAllMocks()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  window.localStorage.clear()
  await i18n.changeLanguage('en')
})

describe('rankings response handling', () => {
  it.each([
    { name: 'array', data: [] },
    { name: 'empty object', data: {} },
    { name: 'null', data: null },
    {
      name: 'missing model history',
      data: { ...emptySnapshot, models_history: undefined },
    },
    { name: 'null movers', data: { ...emptySnapshot, top_movers: null } },
    {
      name: 'missing vendor points',
      data: { ...emptySnapshot, vendor_share_history: { buckets: 0 } },
    },
  ])('rejects an incomplete success payload: $name', async ({ data }) => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data } })

    await expect(getRankings('week')).rejects.toThrow(
      'Unable to load rankings data'
    )
  })

  it('translates the invalid-data message into the current interface language', async () => {
    i18n.addResourceBundle('zh', 'translation', zh.translation)
    await i18n.changeLanguage('zh')
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, data: [] },
    })

    await expect(getRankings('week')).rejects.toThrow(
      zh.translation['Unable to load rankings data']
    )
  })

  it('preserves the server error when the rankings request fails', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: false, message: 'Rankings are unavailable', data: null },
    })
    await renderRankings()

    expect(
      await screen.findByRole('heading', { name: 'Unable to load rankings' })
    ).toBeVisible()
    expect(screen.getByText('Rankings are unavailable')).toBeVisible()
  })

  it('shows an inline error for the preview array response and retains period navigation', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, data: [] },
    })
    await renderRankings()

    expect(
      await screen.findByRole('heading', { name: 'Unable to load rankings' })
    ).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Rankings', level: 1 })
    ).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Week' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })

  it('renders a valid empty snapshot without treating no traffic as an error', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, data: emptySnapshot },
    })
    await renderRankings()

    expect(
      await screen.findByRole('heading', { name: 'Top Models' })
    ).toBeVisible()
    expect(screen.getByText('No notable climbers right now')).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: 'Unable to load rankings' })
    ).not.toBeInTheDocument()
  })

  it('loads the selected period and displays the returned model', async () => {
    const user = userEvent.setup()
    const request = vi
      .spyOn(api, 'get')
      .mockImplementation(async (_url, config) => ({
        data: {
          success: true,
          data: {
            ...emptySnapshot,
            models: [
              {
                rank: 1,
                model_name: `model-${config?.params.period}`,
                vendor: 'OpenAI',
                category: 'all',
                total_tokens: 1000,
                share: 1,
                growth_pct: 0,
              },
            ],
          },
        },
      }))
    await renderRankings()
    expect(
      await screen.findByRole('link', { name: 'model-week' })
    ).toBeVisible()

    await user.click(screen.getByRole('tab', { name: 'Month' }))

    expect(
      await screen.findByRole('link', { name: 'model-month' })
    ).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Month' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('/api/rankings', {
        params: { period: 'month' },
      })
    )
  })
})
