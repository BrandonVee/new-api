import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import type { PlanRecord } from '../../../types'
import { SubscriptionPurchaseDialog } from '../subscription-purchase-dialog'

let client: QueryClient
const plan: PlanRecord = {
  plan: {
    id: 3,
    title: 'Gateway Pro',
    price_amount: 9.99,
    currency: 'USD',
    duration_unit: 'month',
    duration_value: 1,
    quota_reset_period: 'never',
    enabled: true,
    sort_order: 0,
    max_purchase_per_user: 0,
    total_amount: 500000,
    allow_balance_pay: false,
    allow_wallet_overflow: true,
  },
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
})
afterEach(() => {
  cleanup()
  client.clear()
})

function Fixture(props: { method: string; label: string; onPaid: () => void }) {
  const [open, setOpen] = useState(true)
  return (
    <QueryClientProvider client={client}>
      <SubscriptionPurchaseDialog
        open={open}
        onOpenChange={setOpen}
        plan={plan}
        enableOnlineTopUp
        epayMethods={[{ type: props.method, name: props.label }]}
        onPurchaseSuccess={props.onPaid}
      />
    </QueryClientProvider>
  )
}

test.each([
  ['wechat_official', 'WeChat Pay (Official)'],
  ['alipay_official', 'Alipay (Official)'],
])(
  'subscription %s purchases use official checkout and refresh subscriptions after confirmation',
  async (method, label) => {
    const onPaid = vi.fn()
    const post = vi.spyOn(api, 'post').mockImplementation(async (path) => ({
      data: {
        success: true,
        data: path.endsWith('/check')
          ? { status: 'success' }
          : {
              trade_no: 'GStestsubscription',
              method,
              qr_code:
                method === 'wechat_official'
                  ? 'weixin://wxpay/bizpayurl?pr=test'
                  : 'https://qr.alipay.com/test',
              amount: '72.93',
              currency: 'CNY',
              expires_at: Math.floor(Date.now() / 1000) + 900,
            },
      },
    }))
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, data: { status: 'pending' } },
    })
    render(<Fixture method={method} label={label} onPaid={onPaid} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Pay' }))
    expect(await screen.findByRole('dialog', { name: label })).toBeVisible()
    expect(post).toHaveBeenCalledWith('/api/subscription/official/pay', {
      plan_id: 3,
      payment_method: method,
    })
    expect(screen.getByText(/¥72\.93/)).toBeVisible()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Check payment status' })
      ).toBeEnabled()
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Check payment status' })
    )
    expect(await screen.findByText('Payment successful')).toBeVisible()
    await waitFor(() => expect(onPaid).toHaveBeenCalledTimes(1))
  }
)
