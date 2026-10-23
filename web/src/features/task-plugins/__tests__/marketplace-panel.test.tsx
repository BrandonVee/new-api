import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { MarketplacePanel } from '../components/marketplace-panel'
import type { MarketplaceIndex, MarketplaceSource } from '../types'

vi.mock('../components/marketplace-install-dialog', () => ({
  MarketplaceInstallDialog: () => null,
}))
vi.mock('../components/marketplace-plugin-card', () => ({
  MarketplacePluginCard: () => null,
}))
vi.mock('../components/marketplace-sources-dialog', () => ({
  MarketplaceSourcesDialog: () => null,
}))

const PRIMARY_INDEX_URL = 'https://plugins.example/index.json'
const SECONDARY_INDEX_URL = 'https://mirror.example/index.json'

const primarySource: MarketplaceSource = {
  name: 'Primary',
  index_url: PRIMARY_INDEX_URL,
}
const secondarySource: MarketplaceSource = {
  name: 'Mirror',
  index_url: SECONDARY_INDEX_URL,
}

const primaryIndex: MarketplaceIndex = {
  indexVersion: 1,
  name: 'Primary catalog',
  plugins: [],
}
const secondaryIndex: MarketplaceIndex = {
  indexVersion: 1,
  name: 'Mirror catalog',
  plugins: [],
}

const queryClients: QueryClient[] = []

function renderPanel(sources = [primarySource, secondarySource]): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  })
  queryClient.setQueryData(['task-plugin-marketplace-sources'], sources)
  queryClient.setQueryData(['task-plugins'], [])
  queryClients.push(queryClient)

  render(
    <QueryClientProvider client={queryClient}>
      <MarketplacePanel />
    </QueryClientProvider>
  )
  return queryClient
}

function requestedUrls(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map(([input]) => String(input))
}

function installIndexFetchMock() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const index = url === SECONDARY_INDEX_URL ? secondaryIndex : primaryIndex
    return new Response(JSON.stringify(index), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  for (const queryClient of queryClients) queryClient.clear()
  queryClients.length = 0
  vi.unstubAllGlobals()
})

describe('MarketplacePanel source switch', () => {
  test('selects only the first configured source by default and hides both URLs', async () => {
    const fetchMock = installIndexFetchMock()
    renderPanel()

    expect(
      await screen.findByRole('heading', {
        name: primaryIndex.name,
      })
    ).toBeInTheDocument()
    expect(
      screen.getByText('Third-party — use at your own risk')
    ).toBeInTheDocument()
    expect(screen.queryByText('Official')).toBeNull()
    expect(screen.queryByText(PRIMARY_INDEX_URL)).toBeNull()
    expect(screen.queryByText(SECONDARY_INDEX_URL)).toBeNull()
    expect(screen.getByRole('button', { name: 'Primary' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(requestedUrls(fetchMock)).toContain(PRIMARY_INDEX_URL)
    expect(requestedUrls(fetchMock)).not.toContain(SECONDARY_INDEX_URL)
  })

  test('loads the alternate source only after the administrator switches to it', async () => {
    const fetchMock = installIndexFetchMock()
    const user = userEvent.setup()
    renderPanel()
    await screen.findByRole('heading', { name: primaryIndex.name })

    expect(requestedUrls(fetchMock)).not.toContain(SECONDARY_INDEX_URL)

    await user.click(screen.getByRole('button', { name: 'Mirror' }))

    expect(
      await screen.findByRole('heading', { name: secondaryIndex.name })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: primaryIndex.name })
    ).toBeNull()
    expect(screen.getByRole('button', { name: 'Mirror' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(requestedUrls(fetchMock)).toContain(SECONDARY_INDEX_URL)
  })

  test('does not request the alternate source automatically when the first configured source fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === PRIMARY_INDEX_URL) {
        return new Response('', { status: 503 })
      }
      return new Response(JSON.stringify(secondaryIndex), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    renderPanel()

    expect(
      await screen.findByText('Could not load this source')
    ).toBeInTheDocument()
    expect(requestedUrls(fetchMock)).toContain(PRIMARY_INDEX_URL)
    expect(requestedUrls(fetchMock)).not.toContain(SECONDARY_INDEX_URL)
  })

  test.each([
    'https://www.newapi.ai/api/v1/plugins/index.json',
    'https://raw.githubusercontent.com/QuantumNous/new-api-plugins/main/index.json',
  ])(
    'does not label an upstream project index as official: %s',
    async (indexUrl) => {
      installIndexFetchMock()
      renderPanel([{ name: 'Upstream', index_url: indexUrl }])

      await screen.findByRole('heading', { name: primaryIndex.name })

      expect(
        screen.getByText('Third-party — use at your own risk')
      ).toBeInTheDocument()
      expect(screen.queryByText('Official')).toBeNull()
    }
  )

  test('revalidates the index instead of reusing a stale browser-cached copy', async () => {
    const staleIndex: MarketplaceIndex = { ...primaryIndex, name: 'Stale' }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const revalidated = ['no-cache', 'no-store', 'reload'].includes(
          init?.cache ?? 'default'
        )
        return new Response(
          JSON.stringify(revalidated ? primaryIndex : staleIndex),
          { status: 200 }
        )
      })
    )
    renderPanel()

    expect(
      await screen.findByRole('heading', { name: primaryIndex.name })
    ).toBeInTheDocument()
  })
})
