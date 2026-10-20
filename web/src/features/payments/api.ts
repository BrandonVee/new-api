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
}

const checkoutSchema = z.object({
  trade_no: z.string().min(1),
  method: z.enum(['wechat_official', 'alipay_official']),
  qr_code: z.string().min(1),
  amount: z.string().regex(/^\d+\.\d{2}$/),
  currency: z.literal('CNY'),
  expires_at: z.number().int().positive(),
})

export function isOfficialPayment(
  method: string
): method is OfficialPaymentMethod {
  return method === 'wechat_official' || method === 'alipay_official'
}

export async function createOfficialCheckout(
  request: { payment_method: OfficialPaymentMethod } & (
    | { amount: number }
    | { plan_id: number }
  )
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
