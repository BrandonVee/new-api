import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { createOfficialCheckout, type OfficialCheckout } from '../api'
import { PaymentQRDialog } from '../payment-qr-dialog'

let client: QueryClient
const checkout: OfficialCheckout = {
  trade_no: 'GWtestorder',
  method: 'wechat_official',
  qr_code: 'weixin://wxpay/bizpayurl?pr=test',
  amount: '12.34',
  currency: 'CNY',
  expires_at: 0,
}

beforeEach(() => {
  vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: true, data: { status: 'pending' } },
  })
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
})
afterEach(() => {
  cleanup()
  client.clear()
})

function renderCheckout(
  values: Partial<OfficialCheckout> = {},
  onPaid = vi.fn()
) {
  const onClose = vi.fn()
  const result = render(
    <QueryClientProvider client={client}>
      <PaymentQRDialog
        checkout={{
          ...checkout,
          expires_at: Math.floor(Date.now() / 1000) + 900,
          ...values,
        }}
        onClose={onClose}
        onPaid={onPaid}
      />
    </QueryClientProvider>
  )
  return { ...result, onPaid, onClose }
}

test('pending checkout shows its payment amount and never treats a status check as payment', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { status: 'pending' } },
  })
  const { onPaid } = renderCheckout()
  expect(
    await screen.findByRole('dialog', { name: 'WeChat Pay (Official)' })
  ).toBeVisible()
  expect(screen.getByText(/¥12\.34/)).toBeVisible()
  expect(screen.getByTitle('Payment QR code')).toBeInTheDocument()
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Check payment status' })
    ).toBeEnabled()
  )
  await userEvent.click(
    screen.getByRole('button', { name: 'Check payment status' })
  )
  await waitFor(() =>
    expect(api.post).toHaveBeenCalledWith(
      '/api/user/official/orders/GWtestorder/check'
    )
  )
  expect(onPaid).not.toHaveBeenCalled()
  expect(screen.getByText('Waiting for payment confirmation')).toBeVisible()
})

test('confirmed checkout refreshes balances once and replaces its QR code with a receipt', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { status: 'success' } },
  })
  const { onPaid, onClose } = renderCheckout({
    method: 'alipay_official',
    qr_code: 'https://qr.alipay.com/test',
  })
  expect(await screen.findByText('Payment successful')).toBeVisible()
  await waitFor(() => expect(onPaid).toHaveBeenCalledTimes(1))
  expect(screen.queryByTitle('Payment QR code')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Check payment status' })
  ).not.toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  expect(onClose).toHaveBeenCalledTimes(1)
})

test('expired checkout hides the unusable code and permits a final status check', async () => {
  vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: true, data: { status: 'success' } },
  })
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { status: 'success' } },
  })
  renderCheckout({ expires_at: Math.floor(Date.now() / 1000) - 1 })
  expect(
    await screen.findByText(
      'Payment code expired. Close this dialog and create a new order.'
    )
  ).toBeVisible()
  expect(screen.queryByTitle('Payment QR code')).not.toBeInTheDocument()
  await userEvent.click(
    screen.getByRole('button', { name: 'Check payment status' })
  )
  expect(await screen.findByText('Payment successful')).toBeVisible()
})

test('a failed status response allows retry without reporting payment success', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: false, message: 'Order not found' },
  })
  const { onPaid } = renderCheckout()
  expect(
    await screen.findByText('Unable to check payment status. Please retry.')
  ).toBeVisible()
  expect(onPaid).not.toHaveBeenCalled()
  expect(
    screen.getByRole('button', { name: 'Check payment status' })
  ).toBeEnabled()
})

test('checkout requests route wallet and subscription purchases to their own APIs', async () => {
  const post = vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: true, data: { ...checkout, expires_at: 9999999999 } },
  })
  await createOfficialCheckout({
    amount: 10,
    payment_method: 'wechat_official',
  })
  expect(post).toHaveBeenLastCalledWith('/api/user/official/pay', {
    amount: 10,
    payment_method: 'wechat_official',
  })
  await createOfficialCheckout({
    plan_id: 3,
    payment_method: 'alipay_official',
  })
  expect(post).toHaveBeenLastCalledWith('/api/subscription/official/pay', {
    plan_id: 3,
    payment_method: 'alipay_official',
  })
})

test('checkout rejects business failures and incomplete QR responses', async () => {
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValueOnce({
      data: {
        success: false,
        message: 'Official payment method is unavailable',
      },
    })
    .mockResolvedValueOnce({ data: { success: true, data: {} } })
  await expect(
    createOfficialCheckout({ amount: 10, payment_method: 'wechat_official' })
  ).rejects.toThrow('Official payment method is unavailable')
  await expect(
    createOfficialCheckout({ amount: 10, payment_method: 'wechat_official' })
  ).rejects.toThrow()
  expect(post).toHaveBeenCalledTimes(2)
})
