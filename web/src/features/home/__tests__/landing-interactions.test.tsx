import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { PublicHeader } from '@/components/layout/components/public-header'
import zh from '@/i18n/locales/zh.json'

import { HomeFAQ } from '../components/sections/faq'
import { HowItWorks } from '../components/sections/how-it-works'
import { ModelShowcase } from '../components/sections/model-showcase'

async function renderLandingSection(children: ReactNode) {
  const root = createRootRoute({ component: () => children })
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return render(<RouterProvider router={router} />)
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('home model discovery', () => {
  it('filters the catalog by category and restores all providers when All is selected', async () => {
    const user = userEvent.setup()
    await renderLandingSection(<ModelShowcase />)
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(4)

    await user.click(screen.getByRole('tab', { name: 'Multimodal' }))

    expect(screen.getByRole('tab', { name: 'Multimodal' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(
      screen.queryByRole('heading', { name: 'DeepSeek' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Qwen' })).toBeVisible()
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3)

    await user.click(screen.getByRole('tab', { name: 'All' }))
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(4)
  })

  it('supports keyboard category selection and preserves provider searches in catalog links', async () => {
    const user = userEvent.setup()
    await renderLandingSection(<ModelShowcase />)
    const selected = screen.getByRole('tab', { name: 'All' })
    selected.focus()

    await user.keyboard('{End}{Enter}')

    const multimodal = screen.getByRole('tab', { name: 'Multimodal' })
    expect(multimodal).toHaveFocus()
    expect(multimodal).toHaveAttribute('aria-selected', 'true')
    const catalogLinks = within(screen.getByRole('tabpanel')).getAllByRole(
      'button',
      { name: 'View available models' }
    )
    expect(catalogLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/pricing?search=qwen',
      '/pricing?search=claude',
      '/pricing?search=gemini',
    ])
  })

  it('updates translated categories after a language change without resetting the selection', async () => {
    const user = userEvent.setup()
    i18n.addResourceBundle('zh', 'translation', zh.translation)
    await renderLandingSection(<ModelShowcase />)
    await user.click(screen.getByRole('tab', { name: 'Multimodal' }))

    await act(() => i18n.changeLanguage('zh'))

    expect(
      screen.getByRole('tab', { name: zh.translation.Multimodal })
    ).toHaveAttribute('aria-selected', 'true')
    expect(
      screen.getByRole('heading', {
        name: zh.translation['Leading models. One familiar API.'],
      })
    ).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: 'DeepSeek' })
    ).not.toBeInTheDocument()
  })
})

describe('home integration guide', () => {
  it('copies the normalized site endpoint and a complete SDK example with placeholder credentials', async () => {
    const user = userEvent.setup()
    await renderLandingSection(
      <HowItWorks baseUrl='https://gateway.example.test///' />
    )
    const example = screen.getByLabelText('Python integration example')

    await user.click(screen.getByRole('button', { name: 'Copy base URL' }))

    expect(await navigator.clipboard.readText()).toBe(
      'https://gateway.example.test/v1'
    )
    expect(screen.getByRole('button', { name: 'Copied' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Copy code' }))

    expect(await navigator.clipboard.readText()).toBe(example.textContent)
    expect(example).toHaveTextContent(
      'base_url="https://gateway.example.test/v1"'
    )
    expect(example).toHaveTextContent('api_key="YOUR_API_KEY"')
    expect(example).toHaveTextContent('model="YOUR_MODEL_NAME"')
    expect(example).toHaveTextContent(
      'print(response.choices[0].message.content)'
    )
  })

  it.each([
    { isAuthenticated: false, destination: '/sign-in' },
    { isAuthenticated: true, destination: '/keys' },
  ])(
    'sends the API key action to $destination for the current session state',
    async (fixture) => {
      await renderLandingSection(
        <HowItWorks
          baseUrl='https://gateway.example.test'
          isAuthenticated={fixture.isAuthenticated}
        />
      )
      expect(
        screen.getByRole('button', { name: 'Get your API key' })
      ).toHaveAttribute('href', fixture.destination)
    }
  )
})

describe('home frequently asked questions', () => {
  it('opens a question with the keyboard and exposes the expanded state and answer', async () => {
    const user = userEvent.setup()
    await renderLandingSection(<HomeFAQ />)
    const first = screen.getByRole('button', {
      name: 'Can I keep using the OpenAI SDK?',
    })
    expect(first).toHaveAttribute('aria-expanded', 'true')
    const streaming = screen.getByRole('button', {
      name: 'Are streaming responses supported?',
    })
    expect(streaming).toHaveAttribute('aria-expanded', 'false')
    streaming.focus()

    await user.keyboard('{Enter}')

    expect(streaming).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByText(
        'Streaming is available for supported models and API routes. Enable streaming in your SDK request to receive the response as it is generated.'
      )
    ).toBeVisible()

    await user.keyboard('{Enter}')

    await waitFor(() =>
      expect(streaming).toHaveAttribute('aria-expanded', 'false')
    )
    expect(streaming).toHaveFocus()
  })
})

describe('home mobile navigation', () => {
  it('keeps the closed menu out of keyboard navigation and exposes links after opening', async () => {
    const user = userEvent.setup()
    const client = new QueryClient()
    client.setQueryData(['status'], {})
    client.setQueryData(['notice'], { success: true, data: '' })
    const view = await renderLandingSection(
      <QueryClientProvider client={client}>
        <PublicHeader
          showThemeSwitch={false}
          showLanguageSwitcher={false}
          showAuthButtons={false}
          showNotifications={false}
        />
      </QueryClientProvider>
    )
    const toggle = screen.getByRole('button', {
      name: 'Toggle navigation menu',
    })
    const menu = document.querySelector(
      `#${toggle.getAttribute('aria-controls')}`
    )
    if (!(menu instanceof HTMLElement)) {
      throw new Error('The navigation toggle must control its menu')
    }
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(menu).toHaveAttribute('inert')
    expect(
      within(menu).queryByRole('link', { name: 'Home' })
    ).not.toBeInTheDocument()

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(menu).not.toHaveAttribute('inert')
    expect(within(menu).getByRole('link', { name: 'Home' })).toBeVisible()

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(menu).toHaveAttribute('aria-hidden', 'true')
    expect(menu).toHaveAttribute('inert')
    view.unmount()
    client.clear()
  })
})
