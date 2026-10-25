import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { useUpdateOption } from '@/features/system-settings/hooks/use-update-option'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { api } from '@/lib/api'
import {
  getModuleAccessForGuard,
  type HeaderNavModule,
} from '@/lib/nav-modules'
import {
  STATUS_QUERY_KEY,
  ensureStatus,
  statusQueryOptions,
} from '@/lib/status-query'
import {
  getLogo,
  getSystemName,
  useSystemConfigStore,
} from '@/stores/system-config-store'

/**
 * Guards the deduplication contract of the shared `['status']` query: several
 * independent consumers asking for status must cost one `/api/status` request.
 */

type ApiMethod = (url: string) => Promise<{ data: unknown }>
type MockableApi = { get: ApiMethod }

const apiClient = api as unknown as MockableApi
const originalGet = apiClient.get

let statusRequests: string[] = []
const queryClients: QueryClient[] = []

/** Count `/api/status` calls at the network boundary and serve `system_name`. */
function stubStatusEndpoint(systemName: string): void {
  apiClient.get = async (url) => {
    if (url !== '/api/status') throw new Error(`Unexpected GET ${url}`)
    statusRequests.push(url)
    return { data: { success: true, data: { system_name: systemName } } }
  }
}

function createQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  queryClients.push(queryClient)
  return queryClient
}

function wrapper(queryClient: QueryClient) {
  return function QueryWrapper(props: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {props.children}
      </QueryClientProvider>
    )
  }
}

beforeEach(() => {
  statusRequests = []
  window.localStorage.clear()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
})

afterEach(() => {
  cleanup()
  queryClients.splice(0).forEach((client) => client.clear())
  apiClient.get = originalGet
  window.localStorage.clear()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
})

describe('site branding', () => {
  test.each([
    {
      savedLogo: 'https://cdn.example.com/new-brand.svg',
      expectedLogo: 'https://cdn.example.com/new-brand.svg',
    },
    { savedLogo: '', expectedLogo: '/kaiming-energy-mark.svg' },
  ])(
    'refreshes site branding immediately after saving logo $savedLogo',
    async ({ savedLogo, expectedLogo }) => {
      const queryClient = createQueryClient()
      queryClient.setQueryData(STATUS_QUERY_KEY, {
        logo: '/previous-brand.svg',
      })
      useSystemConfigStore.getState().setConfig({ logo: '/previous-brand.svg' })
      apiClient.get = async (url) => {
        statusRequests.push(url)
        return { data: { success: true, data: { logo: savedLogo } } }
      }
      vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
      const hook = renderHook(
        () => {
          useStatus()
          return { branding: useSystemConfig(), update: useUpdateOption() }
        },
        { wrapper: wrapper(queryClient) }
      )
      await act(() =>
        hook.result.current.update.mutateAsync({
          key: 'Logo',
          value: savedLogo,
        })
      )
      await waitFor(() =>
        expect(hook.result.current.branding.logo).toBe(expectedLogo)
      )
      expect(statusRequests).toEqual(['/api/status'])
    }
  )

  test.each([
    { configuredLogo: '', displayLogo: '/kaiming-energy-mark.svg' },
    { configuredLogo: '/logo.png', displayLogo: '/kaiming-energy-mark.svg' },
    {
      configuredLogo: '/ai-gateway-logo.png',
      displayLogo: '/kaiming-energy-mark.svg',
    },
    {
      configuredLogo: 'https://cdn.example.com/custom-brand.svg',
      displayLogo: 'https://cdn.example.com/custom-brand.svg',
    },
  ])(
    'uses $displayLogo for cached and refreshed logo $configuredLogo',
    async (scenario) => {
      useSystemConfigStore
        .getState()
        .setConfig({ logo: scenario.configuredLogo })
      const queryClient = createQueryClient()
      const hook = renderHook(() => useSystemConfig(), {
        wrapper: wrapper(queryClient),
      })

      expect(hook.result.current.logo).toBe(scenario.displayLogo)
      expect(getLogo()).toBe(scenario.displayLogo)

      apiClient.get = async () => ({
        data: { success: true, data: { logo: scenario.configuredLogo } },
      })
      await ensureStatus(queryClient)

      expect(useSystemConfigStore.getState().config.logo).toBe(
        scenario.displayLogo
      )
    }
  )

  test.each([
    { configuredName: '', displayName: 'Ai-gateway' },
    { configuredName: 'New API', displayName: 'Ai-gateway' },
    { configuredName: 'NewAPI', displayName: 'Ai-gateway' },
    { configuredName: 'newapi', displayName: 'Ai-gateway' },
    { configuredName: 'new-api', displayName: 'Ai-gateway' },
    { configuredName: ' New API ', displayName: 'Ai-gateway' },
    { configuredName: 'Ai-gateway', displayName: 'Ai-gateway' },
    { configuredName: 'Ai-Gateway', displayName: 'Ai-gateway' },
    { configuredName: 'Ai- gateway', displayName: 'Ai-gateway' },
    { configuredName: 'Research Gateway', displayName: 'Research Gateway' },
  ])(
    'displays $displayName for cached and refreshed $configuredName branding',
    async (scenario) => {
      useSystemConfigStore
        .getState()
        .setConfig({ systemName: scenario.configuredName })
      const queryClient = createQueryClient()
      const hook = renderHook(() => useSystemConfig(), {
        wrapper: wrapper(queryClient),
      })

      expect(hook.result.current.systemName).toBe(scenario.displayName)
      expect(getSystemName()).toBe(scenario.displayName)

      stubStatusEndpoint(scenario.configuredName)
      await ensureStatus(queryClient)

      expect(useSystemConfigStore.getState().config.systemName).toBe(
        scenario.displayName
      )
    }
  )
})

describe('shared status query deduplication', () => {
  test.each(['cold', 'stale'] as const)(
    'deduplicates %s cache requests across guards and hook consumers',
    async (cacheState) => {
      const queryClient = createQueryClient()
      if (cacheState === 'stale') {
        queryClient.setQueryData(
          STATUS_QUERY_KEY,
          {
            system_name: 'old',
            HeaderNavModules: { pricing: false, rankings: false },
          },
          { updatedAt: Date.now() - 600_000 }
        )
      }
      const status = {
        system_name: 'shared',
        HeaderNavModules: {
          pricing: { enabled: true, requireAuth: true },
          rankings: { enabled: true, requireAuth: false },
        },
      }
      let resolveStatus!: (value: { data: unknown }) => void
      const response = new Promise<{ data: unknown }>((resolve) => {
        resolveStatus = resolve
      })
      apiClient.get = (url) => {
        statusRequests.push(url)
        return response
      }
      let guardsResolved = false
      const guards = Promise.all([
        getModuleAccessForGuard(queryClient, 'pricing'),
        getModuleAccessForGuard(queryClient, 'rankings'),
      ]).then((result) => {
        guardsResolved = true
        return result
      })
      const hook = renderHook(() => useStatus(), {
        wrapper: wrapper(queryClient),
      })
      await waitFor(() => expect(statusRequests).toEqual(['/api/status']))
      expect(guardsResolved).toBe(false)
      resolveStatus({ data: { success: true, data: status } })
      expect(await guards).toEqual([
        { enabled: true, requireAuth: true },
        { enabled: true, requireAuth: false },
      ])
      await waitFor(() =>
        expect(hook.result.current.status?.system_name).toBe('shared')
      )
      expect(statusRequests).toHaveLength(1)
    }
  )

  test('resolves a later consumer from the warm cache without a second request', async () => {
    stubStatusEndpoint('warm')
    const queryClient = createQueryClient()

    await ensureStatus(queryClient)
    const second = await ensureStatus(queryClient)

    expect(second?.system_name).toBe('warm')
    expect(statusRequests).toHaveLength(1)
  })

  test('returns a stale entry immediately and refreshes it in the background', async () => {
    stubStatusEndpoint('refreshed')
    const queryClient = createQueryClient()
    const staleTime = statusQueryOptions.staleTime as number
    queryClient.setQueryData(
      STATUS_QUERY_KEY,
      { system_name: 'stale' },
      {
        updatedAt: Date.now() - staleTime - 1,
      }
    )

    const resolved = await ensureStatus(queryClient)

    expect(resolved?.system_name).toBe('stale')
    await waitFor(() => {
      expect(
        queryClient.getQueryData<Record<string, unknown>>(STATUS_QUERY_KEY)
          ?.system_name
      ).toBe('refreshed')
    })
    expect(statusRequests).toHaveLength(1)
  })
})

describe('module guard status freshness', () => {
  test.each([
    {
      module: 'pricing',
      before: { enabled: false, requireAuth: false },
      after: { enabled: true, requireAuth: false },
    },
    {
      module: 'rankings',
      before: { enabled: true, requireAuth: false },
      after: { enabled: false, requireAuth: false },
    },
    {
      module: 'pricing',
      before: { enabled: true, requireAuth: false },
      after: { enabled: true, requireAuth: true },
    },
    {
      module: 'rankings',
      before: { enabled: true, requireAuth: true },
      after: { enabled: true, requireAuth: false },
    },
  ])('uses refreshed $module access: $before -> $after', async (scenario) => {
    const queryClient = createQueryClient()
    queryClient.setQueryData(
      STATUS_QUERY_KEY,
      { HeaderNavModules: { [scenario.module]: scenario.before } },
      { updatedAt: Date.now() - 600_000 }
    )
    apiClient.get = async () => ({
      data: {
        success: true,
        data: { HeaderNavModules: { [scenario.module]: scenario.after } },
      },
    })
    expect(
      await getModuleAccessForGuard(
        queryClient,
        scenario.module as HeaderNavModule
      )
    ).toEqual(scenario.after)
  })

  test('reuses fresh access but refreshes explicitly invalidated access', async () => {
    const queryClient = createQueryClient()
    queryClient.setQueryData(STATUS_QUERY_KEY, {
      HeaderNavModules: { pricing: false },
    })
    stubStatusEndpoint('updated')
    expect(await getModuleAccessForGuard(queryClient, 'pricing')).toEqual({
      enabled: false,
      requireAuth: false,
    })
    expect(statusRequests).toHaveLength(0)
    await queryClient.invalidateQueries({ queryKey: STATUS_QUERY_KEY })
    expect(await getModuleAccessForGuard(queryClient, 'pricing')).toEqual({
      enabled: true,
      requireAuth: false,
    })
    expect(statusRequests).toHaveLength(1)
  })

  test.each(['cold', 'stale'] as const)(
    'fails closed when a %s cache request fails',
    async (cacheState) => {
      const queryClient = createQueryClient()
      if (cacheState === 'stale') {
        queryClient.setQueryData(
          STATUS_QUERY_KEY,
          { HeaderNavModules: { pricing: true } },
          { updatedAt: Date.now() - 600_000 }
        )
      }
      apiClient.get = async () => {
        throw new Error('Status unavailable')
      }
      expect(await getModuleAccessForGuard(queryClient, 'pricing')).toEqual({
        enabled: false,
        requireAuth: true,
      })
    }
  )
})
