import { createHash, webcrypto } from 'node:crypto'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { SettingsPageProvider } from '../../components/settings-page-context'
import { OfficialPaymentSettings } from '../official-payment-settings'

let client: QueryClient
const config = {
  compliance_confirmed: true,
  settings: {
    callback_url: 'https://gateway.example.com',
    wechat_enabled: false,
    wechat_app_id: 'wx-test',
    wechat_mch_id: '1234',
    wechat_serial_no: 'ABC',
    wechat_private_key: '',
    wechat_api_v3_key: '',
    wechat_public_key_id: 'PUB_KEY_ID_TEST',
    wechat_public_key: '',
    alipay_enabled: false,
    alipay_app_id: 'alipay-test',
    alipay_seller_id: '2088',
    alipay_private_key: '',
    alipay_public_key: '',
  },
  configured: {
    wechat_private_key: true,
    wechat_api_v3_key: true,
    alipay_private_key: true,
  },
}

function Fixture() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  return (
    <QueryClientProvider client={client}>
      <div ref={setContainer} />
      <SettingsPageProvider actionsContainer={container}>
        <OfficialPaymentSettings />
      </SettingsPageProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto)
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: {
      success: true,
      data:
        url === '/api/verify/methods'
          ? {
              scope: 'payment.merchant.update',
              methods: [{ method: 'password', available: true }],
              oauth_providers: [],
              password_encryption_enabled: false,
            }
          : config,
    },
  }))
  vi.spyOn(api, 'post').mockResolvedValue({
    data: {
      success: true,
      data: {
        proof_token: 'single-use-test-proof',
        scope: 'payment.merchant.update',
        method: 'password',
        expires_at: 9999999999,
      },
    },
  })
})
afterEach(() => {
  client.clear()
  vi.unstubAllGlobals()
})

async function confirmIdentity() {
  await userEvent.type(
    await screen.findByLabelText('Password', { selector: 'input' }),
    'test-password'
  )
  await userEvent.click(screen.getByRole('button', { name: 'Verify' }))
}

test('saved credentials stay empty and multiline PEM keys survive form submission', async () => {
  const put = vi
    .spyOn(api, 'put')
    .mockResolvedValue({ data: { success: true, data: config } })
  render(<Fixture />)
  const privateKey = await screen.findByLabelText(
    'WeChat merchant private key (PEM)'
  )
  expect(privateKey).toHaveValue('')
  expect(privateKey).toHaveAttribute(
    'placeholder',
    'Configured — leave blank to keep'
  )
  expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()
  const pem = '-----BEGIN PRIVATE KEY-----\nZmFrZQ==\n-----END PRIVATE KEY-----'
  await userEvent.type(privateKey, pem)
  await userEvent.click(
    screen.getByRole('switch', { name: 'WeChat Pay (Official)' })
  )
  await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
  expect(put).not.toHaveBeenCalled()
  await confirmIdentity()
  await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
  const [path, body, options] = put.mock.calls[0]
  expect(path).toBe('/api/option/official_payment')
  expect(JSON.parse(String(body))).toEqual(
    expect.objectContaining({
      wechat_private_key: pem,
      alipay_private_key: '',
      wechat_api_v3_key: '',
      wechat_enabled: true,
    })
  )
  expect(options?.headers).toEqual(
    expect.objectContaining({ 'X-Security-Proof': 'single-use-test-proof' })
  )
  expect(api.post).toHaveBeenCalledWith(
    '/api/verify',
    expect.objectContaining({
      context: {
        settings_digest: createHash('sha256')
          .update(String(body))
          .digest('hex'),
      },
    }),
    expect.anything()
  )
  await waitFor(() =>
    expect(
      screen.getByLabelText('WeChat merchant private key (PEM)')
    ).toHaveValue('')
  )
})

test('failed saves retain the edited merchant settings for correction', async () => {
  vi.spyOn(api, 'put').mockResolvedValue({
    data: {
      success: false,
      message: 'Official payment configuration is invalid',
    },
  })
  render(<Fixture />)
  const app = await screen.findByLabelText('Alipay App ID')
  await userEvent.clear(app)
  await userEvent.type(app, 'new-app')
  await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
  await confirmIdentity()
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled()
  )
  expect(app).toHaveValue('new-app')
})

test('canceling identity verification keeps the draft and never sends merchant credentials', async () => {
  const put = vi.spyOn(api, 'put')
  render(<Fixture />)
  const app = await screen.findByLabelText('Alipay App ID')
  await userEvent.clear(app)
  await userEvent.type(app, 'unsaved-app')
  await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
  await screen.findByLabelText('Password', { selector: 'input' })
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled()
  )
  expect(put).not.toHaveBeenCalled()
  expect(app).toHaveValue('unsaved-app')
})

test('incomplete configuration responses show a retry state without crashing the settings page', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: {} } })
  render(<Fixture />)
  expect(await screen.findByText('Failed to load settings')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
  expect(screen.queryByLabelText('Alipay App ID')).not.toBeInTheDocument()
})
