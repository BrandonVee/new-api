import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import i18n from 'i18next'
import { afterEach, beforeEach, expect, it } from 'vitest'

import en from '@/i18n/locales/en.json'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { Footer } from '../components/footer'

const clients: QueryClient[] = []

beforeEach(async () => {
  localStorage.clear()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  i18n.addResourceBundle('en', 'translation', en.translation)
  await i18n.changeLanguage('en')
})

afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  localStorage.clear()
})

it.each([
  { presentation: 'default', footerHtml: '', demoSiteEnabled: false },
  { presentation: 'demo', footerHtml: '', demoSiteEnabled: true },
  {
    presentation: 'custom HTML',
    footerHtml: '<p>Custom footer content</p>',
    demoSiteEnabled: false,
  },
])(
  'shows usage guidelines without maintainer attribution or upstream promotion in the $presentation footer',
  async (fixture) => {
    const queryClient = new QueryClient()
    clients.push(queryClient)
    queryClient.setQueryData(['status'], {})
    useSystemConfigStore.getState().setConfig({
      footerHtml: fixture.footerHtml,
      demoSiteEnabled: fixture.demoSiteEnabled,
    })
    const root = createRootRoute({
      component: () => (
        <QueryClientProvider client={queryClient}>
          <Footer />
        </QueryClientProvider>
      ),
    })
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()

    render(<RouterProvider router={router} />)

    const footer = within(screen.getByRole('contentinfo'))
    expect(footer.queryByText(/Brandon|Maintained by/)).not.toBeInTheDocument()
    expect(
      footer.queryByRole('link', { name: 'Legal Notices' })
    ).not.toBeInTheDocument()
    expect(
      footer
        .getAllByRole('link', { name: 'Usage Guidelines' })
        .every((link) => link.getAttribute('href') === '/usage-guidelines')
    ).toBe(true)
    expect(
      footer.queryByRole('link', { name: 'New API' })
    ).not.toBeInTheDocument()
    expect(
      footer
        .getAllByRole('link')
        .every(
          (link) =>
            !/newapi|new-api|QuantumNous/i.test(link.getAttribute('href') ?? '')
        )
    ).toBe(true)
    if (fixture.footerHtml) {
      expect(footer.getByText('Custom footer content')).toBeVisible()
    }
  }
)
