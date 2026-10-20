import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, test } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import { useTopNavLinks } from '../use-top-nav-links'

let client: QueryClient

afterEach(() => {
  cleanup()
  client?.clear()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  localStorage.clear()
})

test.each([
  { configured: undefined, href: '/', external: false },
  { configured: '', href: '/', external: false },
  { configured: '/', href: '/', external: false },
  { configured: 'https://docs.newapi.pro', href: '/', external: false },
  {
    configured: 'https://docs.newapi.pro/getting-started/',
    href: '/',
    external: false,
  },
  { configured: 'https://docs.newapi.ai/', href: '/', external: false },
  { configured: '/help', href: '/help', external: false },
  {
    configured: 'https://help.gateway.example',
    href: 'https://help.gateway.example',
    external: true,
  },
])('resolves documentation configured as $configured to $href', (fixture) => {
  localStorage.clear()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['status'], { docs_link: fixture.configured })

  const result = renderHook(useTopNavLinks, {
    wrapper: (props: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        {props.children}
      </QueryClientProvider>
    ),
  })

  expect(
    result.result.current.find((link) => link.title === 'Docs')
  ).toMatchObject({
    href: fixture.href,
    external: fixture.external,
  })
})
