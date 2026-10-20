import { act, renderHook } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { PAYMENT_TYPES } from '../constants'
import { requestPaymentAmount, usePayment } from './use-payment'

test.each(['wechat_official', 'alipay_official'])(
  'official %s confirmation uses the same cents quote as checkout',
  async (method) => {
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { success: true, data: '2.68' } })
    expect(await requestPaymentAmount(1, method)).toBe(2.68)
    expect(post).toHaveBeenCalledWith('/api/user/official/amount', {
      amount: 1,
    })
  }
)

test.each(['wechat_official', 'alipay_official'])(
  'wallet %s payment opens the shared official QR checkout',
  async (method) => {
    const checkout = {
      trade_no: 'GWtestorder',
      method,
      qr_code:
        method === 'wechat_official'
          ? 'weixin://wxpay/bizpayurl?pr=test'
          : 'https://qr.alipay.com/test',
      amount: '70.00',
      currency: 'CNY',
      expires_at: 9999999999,
    }
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { success: true, data: checkout } })
    const { result } = renderHook(usePayment)
    let success = false
    await act(async () => {
      success = await result.current.processPayment(10, method)
    })
    expect(success).toBe(true)
    expect(post).toHaveBeenCalledWith('/api/user/official/pay', {
      amount: 10,
      payment_method: method,
    })
    expect(result.current.officialCheckout).toEqual(checkout)
  }
)

describe('payment amount routing', () => {
  test('uses the dedicated Waffo amount calculator', async () => {
    const calls: string[] = []
    const amount = await requestPaymentAmount(120, PAYMENT_TYPES.WAFFO, {
      regular: async () => {
        calls.push('regular')
        return { success: true, data: '1' }
      },
      stripe: async () => {
        calls.push('stripe')
        return { success: true, data: '2' }
      },
      waffo: async (request) => {
        calls.push(`waffo:${request.amount}`)
        return { success: true, data: '18.75' }
      },
      waffoPancake: async () => {
        calls.push('pancake')
        return { success: true, data: '4' }
      },
    })

    expect(amount).toBe(18.75)
    expect(calls).toEqual(['waffo:120'])
  })
})
