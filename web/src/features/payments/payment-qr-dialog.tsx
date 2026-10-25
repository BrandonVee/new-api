import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatLocalCurrencyAmount } from '@/lib/currency'

import {
  checkOfficialOrder,
  getOfficialOrder,
  type OfficialCheckout,
} from './api'

interface Props {
  checkout: OfficialCheckout | null
  onClose: () => void
  onPaid?: () => void | Promise<void>
}

export function PaymentQRDialog(props: Props) {
  if (!props.checkout) return null
  return (
    <PaymentQRContent
      key={props.checkout.trade_no}
      checkout={props.checkout}
      onClose={props.onClose}
      onPaid={props.onPaid}
    />
  )
}

function PaymentQRContent(props: Props & { checkout: OfficialCheckout }) {
  const { t, i18n } = useTranslation()
  const [expired, setExpired] = useState(
    () => props.checkout.expires_at * 1000 <= Date.now()
  )
  const notified = useRef(false)
  const onPaid = props.onPaid
  const client = useQueryClient()
  const check = useMutation({
    mutationFn: () => checkOfficialOrder(props.checkout.trade_no),
    onSuccess: async (data) => {
      const queryKey = ['official-payment-order', props.checkout.trade_no]
      await client.cancelQueries({ queryKey })
      client.setQueryData(queryKey, data)
    },
  })
  const query = useQuery({
    queryKey: ['official-payment-order', props.checkout.trade_no],
    queryFn: () => getOfficialOrder(props.checkout.trade_no),
    enabled: !expired,
    refetchInterval: (current) =>
      ['success', 'failed', 'expired'].includes(
        current.state.data?.status ?? ''
      )
        ? false
        : 3000,
    retry: 1,
    meta: { errorToast: false },
  })
  const paid = query.data?.status === 'success'
  const failed =
    query.data?.status === 'failed' || query.data?.status === 'expired'
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const checkoutType = props.checkout.checkout_type ?? 'qr'
  // This is a CNY quote, independent of the console's display currency. The
  // shared money formatter supplies locale/precision without converting it.
  const amount = formatLocalCurrencyAmount(Number(props.checkout.amount), {
    showSymbol: false,
    abbreviate: false,
    digitsLarge: 2,
    digitsSmall: 2,
    locale,
  })

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setExpired(true),
      Math.max(0, props.checkout.expires_at * 1000 - Date.now())
    )
    return () => window.clearTimeout(timeout)
  }, [props.checkout.expires_at])

  useEffect(() => {
    if (paid && !notified.current) {
      notified.current = true
      void onPaid?.()
    }
  }, [paid, onPaid])

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      title={
        props.checkout.method === 'wechat_official'
          ? t('WeChat Pay (Official)')
          : t('Alipay (Official)')
      }
      description={
        checkoutType === 'qr'
          ? t(
              'Scan with the payment app. This page updates after payment confirmation.'
            )
          : t(
              'Complete payment in Alipay, then return here to check the result.'
            )
      }
      contentClassName='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-md'
      footer={
        <Button variant='outline' onClick={props.onClose}>
          {t('Close')}
        </Button>
      }
      bodyClassName='flex flex-col items-center gap-4'
    >
      <p className='text-primary text-3xl font-semibold tabular-nums'>
        ¥{amount} <span className='text-muted-foreground text-sm'>CNY</span>
      </p>
      {paid && (
        <div
          role='status'
          className='flex min-h-52 flex-col items-center justify-center gap-3 text-green-600 dark:text-green-400'
        >
          <CheckCircle2 className='size-14' aria-hidden='true' />
          <p className='font-medium'>{t('Payment successful')}</p>
        </div>
      )}
      {!paid && (expired || failed) && (
        <Alert>
          <AlertDescription>
            {checkoutType === 'qr'
              ? t(
                  'Payment code expired. Close this dialog and create a new order.'
                )
              : t(
                  'Payment order expired. Close this dialog and create a new order.'
                )}
          </AlertDescription>
        </Alert>
      )}
      {!paid && !expired && !failed && (
        <>
          {checkoutType === 'qr' && (
            <div className='rounded-xl bg-white p-4'>
              <QRCodeSVG
                value={props.checkout.qr_code}
                size={208}
                marginSize={2}
                title={t('Payment QR code')}
              />
            </div>
          )}
          {checkoutType === 'redirect' && props.checkout.pay_url && (
            <Button
              role='link'
              render={
                <a
                  href={props.checkout.pay_url}
                  target='_blank'
                  rel='noopener noreferrer'
                />
              }
            >
              {t('Continue to Alipay')}
            </Button>
          )}
          {checkoutType === 'app' && (
            <Alert>
              <AlertDescription>
                {t('Complete this payment in the app that created the order.')}
              </AlertDescription>
            </Alert>
          )}
          <p
            role='status'
            className='text-muted-foreground flex items-center gap-2 text-sm'
          >
            <Loader2 className='size-4 animate-spin' aria-hidden='true' />
            {t('Waiting for payment confirmation')}
          </p>
        </>
      )}
      {query.isError && !paid && (
        <Alert variant='destructive'>
          <AlertDescription>
            {t('Unable to check payment status. Please retry.')}
          </AlertDescription>
        </Alert>
      )}
      {!paid && (
        <Button
          variant='secondary'
          disabled={query.isFetching || check.isPending}
          onClick={() => check.mutate()}
        >
          {t('Check payment status')}
        </Button>
      )}
      <div className='text-muted-foreground flex w-full items-center gap-2 rounded-md border px-3 py-1 text-xs'>
        <span className='min-w-0 flex-1 break-all'>
          {t('Order Number')}: {props.checkout.trade_no}
        </span>
        <CopyButton value={props.checkout.trade_no} />
      </div>
      {props.checkout.trade_no.startsWith('GS') && (
        <p className='text-muted-foreground text-xs'>
          {t(
            'USD subscription prices are converted to CNY using the configured exchange rate. The amount above is the final payment amount.'
          )}
        </p>
      )}
    </Dialog>
  )
}
