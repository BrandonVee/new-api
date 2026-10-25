import { createHash, webcrypto } from 'node:crypto'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { SettingsPageProvider } from '../../components/settings-page-context'
import { PaymentSettingsSection } from '../payment-settings-section'

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
    alipay_products: ['face_to_face'],
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
        <PaymentSettingsSection
          defaultValues={{
            PayAddress: 'https://pay.example.com',
            EpayId: '10001',
            EpayKey: '',
            Price: 7,
            MinTopUp: 1,
            CustomCallbackAddress: '',
            PayMethods: '[]',
            AmountOptions: '[]',
            AmountDiscount: '{}',
            StripeApiSecret: '',
            StripeWebhookSecret: '',
            StripePriceId: '',
            StripeUnitPrice: 1,
            StripeMinTopUp: 1,
            StripePromotionCodesEnabled: false,
            CreemApiKey: '',
            CreemWebhookSecret: '',
            CreemTestMode: false,
            CreemProducts: '[]',
          }}
          waffoDefaultValues={{
            WaffoEnabled: false,
            WaffoApiKey: '',
            WaffoPrivateKey: '',
            WaffoPublicCert: '',
            WaffoSandboxPublicCert: '',
            WaffoSandboxApiKey: '',
            WaffoSandboxPrivateKey: '',
            WaffoSandbox: false,
            WaffoMerchantId: '',
            WaffoCurrency: 'USD',
            WaffoUnitPrice: 1,
            WaffoMinTopUp: 1,
            WaffoNotifyUrl: '',
            WaffoReturnUrl: '',
            WaffoPayMethods: '[]',
          }}
          waffoPancakeDefaultValues={{
            WaffoPancakeMerchantID: '',
            WaffoPancakePrivateKey: '',
            WaffoPancakeReturnURL: '',
          }}
          complianceDefaults={{
            confirmed: true,
            termsVersion: 'v1',
            confirmedAt: 0,
            confirmedBy: 1,
          }}
        />
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
  await userEvent.click(screen.getByRole('tab', { name: 'Epay' }))
  await userEvent.clear(screen.getByLabelText('Epay merchant ID'))
  await userEvent.type(screen.getByLabelText('Epay merchant ID'), 'epay-draft')
  await userEvent.click(
    screen.getByRole('tab', { name: 'WeChat Pay / Alipay' })
  )
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
  await userEvent.click(
    screen.getByRole('checkbox', { name: 'Alipay desktop website payment' })
  )
  await userEvent.click(
    screen.getByRole('checkbox', { name: 'Alipay mobile website payment' })
  )
  await userEvent.click(
    screen.getByRole('checkbox', { name: 'Alipay app payment' })
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
      alipay_products: ['face_to_face', 'page', 'wap', 'app'],
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
  await userEvent.click(screen.getByRole('tab', { name: 'Epay' }))
  expect(screen.getByLabelText('Epay merchant ID')).toHaveValue('epay-draft')
})

test('failed saves retain the edited merchant settings for correction', async () => {
  vi.spyOn(api, 'put').mockResolvedValue({
    data: {
      success: false,
      message: 'Official payment configuration is invalid',
    },
  })
  render(<Fixture />)
  await userEvent.click(
    screen.getByRole('tab', { name: 'WeChat Pay / Alipay' })
  )
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
  await userEvent.click(
    screen.getByRole('tab', { name: 'WeChat Pay / Alipay' })
  )
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
  await userEvent.click(
    screen.getByRole('tab', { name: 'WeChat Pay / Alipay' })
  )
  expect(await screen.findByText('Failed to load settings')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
  expect(screen.queryByLabelText('Alipay App ID')).not.toBeInTheDocument()
})

test('switching payment tabs keeps both drafts and exposes only the active form actions', async () => {
  const user = userEvent.setup()
  const { container } = render(<Fixture />)
  const tabs = within(screen.getByRole('tablist', { name: 'Payment Gateway' }))
  for (const label of [
    'General',
    'WeChat Pay / Alipay',
    'Epay',
    'Stripe',
    'Creem',
    'Waffo Pancake',
    'Waffo',
  ]) {
    expect(tabs.getByRole('tab', { name: label })).toBeVisible()
  }
  expect(screen.getAllByRole('button', { name: 'Save Changes' })).toHaveLength(
    1
  )

  await user.click(tabs.getByRole('tab', { name: 'Epay' }))
  await user.clear(screen.getByLabelText('Epay merchant ID'))
  await user.type(screen.getByLabelText('Epay merchant ID'), 'epay-draft')
  await user.click(tabs.getByRole('tab', { name: 'WeChat Pay / Alipay' }))
  expect(
    tabs.getByRole('tab', { name: 'WeChat Pay / Alipay' })
  ).toHaveAttribute('aria-selected', 'true')
  const app = await screen.findByLabelText('Alipay App ID')
  await user.clear(app)
  await user.type(app, 'official-draft')
  expect(screen.getAllByRole('button', { name: 'Save Changes' })).toHaveLength(
    1
  )
  expect(screen.getByRole('button', { name: 'Reset' })).toBeVisible()
  expect(container.querySelector('form form')).toBeNull()

  await user.click(tabs.getByRole('tab', { name: 'Epay' }))
  expect(screen.getByLabelText('Epay merchant ID')).toHaveValue('epay-draft')
  expect(screen.getAllByRole('button', { name: 'Save Changes' })).toHaveLength(
    1
  )
  expect(
    screen.queryByRole('button', { name: 'Reset' })
  ).not.toBeInTheDocument()
  await user.click(tabs.getByRole('tab', { name: 'WeChat Pay / Alipay' }))
  expect(screen.getByLabelText('Alipay App ID')).toHaveValue('official-draft')
})

test('saving Epay settings does not submit a pending official payment draft', async () => {
  const user = userEvent.setup()
  const put = vi.spyOn(api, 'put').mockResolvedValue({
    data: { success: true },
  })
  render(<Fixture />)
  await user.click(screen.getByRole('tab', { name: 'WeChat Pay / Alipay' }))
  const app = await screen.findByLabelText('Alipay App ID')
  await user.clear(app)
  await user.type(app, 'official-draft')
  await user.click(screen.getByRole('tab', { name: 'Epay' }))
  await user.clear(screen.getByLabelText('Epay merchant ID'))
  await user.type(screen.getByLabelText('Epay merchant ID'), '20002')
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  await waitFor(() =>
    expect(put).toHaveBeenCalledExactlyOnceWith('/api/option/', {
      key: 'EpayId',
      value: '20002',
    })
  )
  expect(api.post).not.toHaveBeenCalled()
  await user.click(screen.getByRole('tab', { name: 'WeChat Pay / Alipay' }))
  expect(screen.getByLabelText('Alipay App ID')).toHaveValue('official-draft')
  expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled()
})

test('enabled Alipay requires a payment product before requesting merchant verification', async () => {
  const put = vi.spyOn(api, 'put')
  render(<Fixture />)
  await userEvent.click(
    screen.getByRole('tab', { name: 'WeChat Pay / Alipay' })
  )
  await userEvent.click(
    await screen.findByRole('switch', { name: 'Alipay (Official)' })
  )
  await userEvent.click(
    screen.getByRole('checkbox', { name: 'Alipay face-to-face payment' })
  )
  await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
  expect(
    await screen.findByText('Select at least one Alipay product.')
  ).toBeVisible()
  expect(
    screen.queryByLabelText('Password', { selector: 'input' })
  ).not.toBeInTheDocument()
  expect(put).not.toHaveBeenCalled()
})
