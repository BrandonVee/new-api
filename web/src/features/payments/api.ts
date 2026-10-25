import { z } from 'zod'

import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

export type OfficialPaymentMethod = 'wechat_official' | 'alipay_official'

export interface OfficialCheckout {
  trade_no: string
  method: OfficialPaymentMethod
  qr_code: string
  amount: string
  currency: 'CNY'
  expires_at: number
  checkout_type?: 'qr' | 'redirect' | 'app'
  pay_url?: string
  order_string?: string
}

const checkoutSchema = z
  .object({
    trade_no: z.string().min(1),
    method: z.enum(['wechat_official', 'alipay_official']),
    qr_code: z.string().default(''),
    checkout_type: z.enum(['qr', 'redirect', 'app']).default('qr'),
    pay_url: z.string().optional(),
    order_string: z.string().optional(),
    amount: z.string().regex(/^\d+\.\d{2}$/),
    currency: z.literal('CNY'),
    expires_at: z.number().int().positive(),
  })
  .superRefine((checkout, ctx) => {
    let valid = false
    if (checkout.checkout_type === 'qr') {
      valid =
        checkout.method === 'wechat_official'
          ? checkout.qr_code.startsWith('weixin://wxpay/bizpayurl?')
          : checkout.qr_code.startsWith('https://qr.alipay.com/')
    } else if (
      checkout.method === 'alipay_official' &&
      checkout.checkout_type === 'redirect'
    ) {
      try {
        const url = new URL(checkout.pay_url ?? '')
        valid =
          url.origin === 'https://openapi.alipay.com' &&
          url.pathname === '/gateway.do' &&
          !url.username &&
          !url.password &&
          !url.hash
      } catch {
        valid = false
      }
    } else if (
      checkout.method === 'alipay_official' &&
      checkout.checkout_type === 'app'
    ) {
      valid = Boolean(checkout.order_string)
    }
    if (!valid) {
      ctx.addIssue({ code: 'custom', message: 'Invalid payment checkout' })
    }
  })

export function isOfficialPayment(
  method: string
): method is OfficialPaymentMethod {
  return method === 'wechat_official' || method === 'alipay_official'
}

export async function createOfficialCheckout(
  request: {
    payment_method: OfficialPaymentMethod
    alipay_product?: 'face_to_face' | 'page' | 'wap' | 'app'
  } & ({ amount: number } | { plan_id: number })
): Promise<OfficialCheckout> {
  const path =
    'plan_id' in request
      ? '/api/subscription/official/pay'
      : '/api/user/official/pay'
  const response = await api.post(path, request)
  return checkoutSchema.parse(requireServerSuccess(response.data).data)
}

export async function getOfficialOrder(
  tradeNo: string
): Promise<{ status: string }> {
  const response = await api.get(
    `/api/user/official/orders/${encodeURIComponent(tradeNo)}`
  )
  return z
    .object({ status: z.enum(['pending', 'success', 'failed', 'expired']) })
    .parse(requireServerSuccess(response.data).data)
}

export async function checkOfficialOrder(
  tradeNo: string
): Promise<{ status: string }> {
  const response = await api.post(
    `/api/user/official/orders/${encodeURIComponent(tradeNo)}/check`
  )
  return z
    .object({ status: z.enum(['pending', 'success', 'failed', 'expired']) })
    .parse(requireServerSuccess(response.data).data)
}
