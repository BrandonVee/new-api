import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { CopyButton } from '@/components/copy-button'
import { ErrorState } from '@/components/error-state'
import { PasswordInput } from '@/components/password-input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  SecureVerificationDialog,
  useSecureVerification,
} from '@/features/auth/secure-verification'
import { api } from '@/lib/api'
import { authRequestOptions, authResult } from '@/lib/secure-verification'
import {
  createServerError,
  requireServerSuccess,
} from '@/lib/server-error-message'

import {
  SettingsForm,
  SettingsSwitchField,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'

const schema = z
  .object({
    callback_url: z.string().trim(),
    wechat_enabled: z.boolean(),
    wechat_app_id: z.string().trim(),
    wechat_mch_id: z.string().trim(),
    wechat_serial_no: z.string().trim(),
    wechat_private_key: z.string(),
    wechat_api_v3_key: z.string(),
    wechat_public_key_id: z.string().trim(),
    wechat_public_key: z.string(),
    alipay_enabled: z.boolean(),
    alipay_app_id: z.string().trim(),
    alipay_seller_id: z.string().trim(),
    alipay_private_key: z.string(),
    alipay_public_key: z.string(),
    alipay_products: z.array(z.enum(['face_to_face', 'page', 'wap', 'app'])),
  })
  .refine(
    (values) => !values.alipay_enabled || values.alipay_products.length > 0,
    {
      path: ['alipay_products'],
      message: 'Select at least one Alipay product.',
    }
  )

type Values = z.infer<typeof schema>
interface ConfigResponse {
  settings: Values
  configured: Record<string, boolean>
  compliance_confirmed: boolean
}
const configQueryKey = ['official-payment-settings']
const configResponseSchema = z.object({
  settings: schema,
  configured: z.record(z.string(), z.boolean()),
  compliance_confirmed: z.boolean(),
})

async function fetchSettings(): Promise<ConfigResponse> {
  const response = await api.get('/api/option/official_payment')
  const parsed = configResponseSchema.safeParse(
    requireServerSuccess(response.data).data
  )
  if (!parsed.success) {
    throw createServerError({ message_key: 'Failed to load settings' })
  }
  return parsed.data
}

export function OfficialPaymentSettings(props: { active?: boolean }) {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: configQueryKey,
    queryFn: fetchSettings,
    refetchOnWindowFocus: false,
  })
  if (query.isPending) return <Skeleton className='h-64 w-full' />
  if (!query.data) {
    return (
      <ErrorState
        title={t('Failed to load settings')}
        onRetry={() => void query.refetch()}
      />
    )
  }
  return (
    <OfficialPaymentForm
      key={query.dataUpdatedAt}
      initial={query.data}
      active={props.active ?? true}
    />
  )
}

const wechatFields = [
  { name: 'wechat_app_id', label: 'WeChat App ID' },
  { name: 'wechat_mch_id', label: 'WeChat Merchant ID' },
  { name: 'wechat_serial_no', label: 'Merchant certificate serial number' },
  { name: 'wechat_public_key_id', label: 'WeChat Pay public key ID' },
  { name: 'wechat_api_v3_key', label: 'WeChat Pay API v3 key', secret: true },
  {
    name: 'wechat_private_key',
    label: 'WeChat merchant private key (PEM)',
    secret: true,
    multiline: true,
  },
  {
    name: 'wechat_public_key',
    label: 'WeChat Pay public key (PEM)',
    multiline: true,
  },
] as const
const alipayFields = [
  { name: 'alipay_app_id', label: 'Alipay App ID' },
  { name: 'alipay_seller_id', label: 'Alipay Seller ID' },
  {
    name: 'alipay_private_key',
    label: 'Alipay application private key (PEM)',
    secret: true,
    multiline: true,
  },
  {
    name: 'alipay_public_key',
    label: 'Alipay public key (PEM)',
    multiline: true,
  },
] as const

function OfficialPaymentForm(props: {
  initial: ConfigResponse
  active: boolean
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const verification = useSecureVerification()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: props.initial.settings,
  })
  const mutation = useMutation({
    mutationFn: async (values: Values): Promise<ConfigResponse | null> => {
      const body = JSON.stringify(values)
      const hash = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(body)
      )
      const digest = Array.from(new Uint8Array(hash), (byte) =>
        byte.toString(16).padStart(2, '0')
      ).join('')
      const proof = await verification.requestVerification({
        scope: 'payment.merchant.update',
        context: { settings_digest: digest },
        title: t('Official Payments'),
      })
      if (!proof) return null
      const response = await authResult<unknown>(
        api.put('/api/option/official_payment', body, {
          ...authRequestOptions,
          headers: {
            'Content-Type': 'application/json',
            'X-Security-Proof': proof.proof_token,
          },
        })
      )
      const parsed = configResponseSchema.safeParse(response)
      if (!parsed.success) {
        throw createServerError({ message_key: 'Failed to save settings' })
      }
      return parsed.data
    },
    onSuccess: (data) => {
      if (!data) return
      form.reset(data.settings)
      client.setQueryData(configQueryKey, data)
      void client.invalidateQueries({ queryKey: ['topup-info'] })
      toast.success(t('Settings saved successfully'))
    },
  })
  const callbackURL = form.watch('callback_url').replace(/\/+$/, '')
  const groups = [
    {
      enabled: 'wechat_enabled',
      title: t('WeChat Pay (Official)'),
      fields: wechatFields,
      provider: 'wechat',
    },
    {
      enabled: 'alipay_enabled',
      title: t('Alipay (Official)'),
      fields: alipayFields,
      provider: 'alipay',
    },
  ] as const

  return (
    <>
      <SettingsSection title={t('Official Payments')}>
        <Form {...form}>
          <SettingsForm
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          >
            {props.active && (
              <SettingsPageFormActions
                onSave={form.handleSubmit((values) => mutation.mutate(values))}
                onReset={() => form.reset()}
                isSaving={mutation.isPending}
                isSaveDisabled={!form.formState.isDirty || mutation.isPending}
              />
            )}
            <Alert>
              <AlertDescription>
                {t(
                  'Connect directly to WeChat Native Pay and Alipay. A public HTTPS callback URL and activated merchant payment products are required.'
                )}
              </AlertDescription>
            </Alert>
            <FormField
              control={form.control}
              name='callback_url'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Public HTTPS callback base URL')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='https://gateway.example.com'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <p className='text-muted-foreground text-xs'>
              {t(
                'Leave secret fields blank to keep saved credentials. Keys must use PEM format. WeChat uses public key mode; Alipay uses RSA2 public key mode.'
              )}
            </p>
            {groups.map((group) => (
              <div
                key={group.enabled}
                className='min-w-0 space-y-4 rounded-xl border p-4'
              >
                <SettingsSwitchField
                  controlId={group.enabled}
                  checked={form.watch(group.enabled)}
                  onCheckedChange={(value) =>
                    form.setValue(group.enabled, value, { shouldDirty: true })
                  }
                  label={group.title}
                />
                {group.provider === 'alipay' && (
                  <FormField
                    control={form.control}
                    name='alipay_products'
                    render={({ field }) => (
                      <FormItem>
                        <fieldset className='space-y-3'>
                          <legend className='text-sm font-medium'>
                            {t('Enabled Alipay products')}
                          </legend>
                          <div className='grid gap-3 sm:grid-cols-2'>
                            {[
                              {
                                value: 'face_to_face' as const,
                                label: t('Alipay face-to-face payment'),
                              },
                              {
                                value: 'page' as const,
                                label: t('Alipay desktop website payment'),
                              },
                              {
                                value: 'wap' as const,
                                label: t('Alipay mobile website payment'),
                              },
                              {
                                value: 'app' as const,
                                label: t('Alipay app payment'),
                              },
                            ].map((product) => (
                              <label
                                key={product.value}
                                className='flex items-center gap-2 text-sm'
                              >
                                <Checkbox
                                  checked={field.value.includes(product.value)}
                                  onCheckedChange={(checked) =>
                                    field.onChange(
                                      checked
                                        ? [...field.value, product.value]
                                        : field.value.filter(
                                            (value) => value !== product.value
                                          )
                                    )
                                  }
                                />
                                {product.label}
                              </label>
                            ))}
                          </div>
                          <p className='text-muted-foreground text-xs'>
                            {t(
                              'Enable only activated products. Browsers automatically prefer desktop or mobile website payments, with QR payment as a fallback.'
                            )}
                          </p>
                          <p className='text-muted-foreground text-xs'>
                            {t(
                              'APP payments return signed orders for the native Alipay SDK. Enable a website or QR product for browser checkout.'
                            )}
                          </p>
                        </fieldset>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <div className='grid gap-4 lg:grid-cols-2'>
                  {group.fields.map((definition) => (
                    <FormField
                      key={definition.name}
                      control={form.control}
                      name={definition.name}
                      render={({ field }) => {
                        const placeholder = props.initial.configured[
                          definition.name
                        ]
                          ? t('Configured — leave blank to keep')
                          : undefined
                        let input = <Input {...field} autoComplete='off' />
                        if ('multiline' in definition) {
                          input = (
                            <Textarea
                              {...field}
                              rows={5}
                              spellCheck={false}
                              autoComplete='off'
                              placeholder={placeholder}
                            />
                          )
                        } else if ('secret' in definition) {
                          input = (
                            <PasswordInput
                              {...field}
                              autoComplete='off'
                              placeholder={placeholder}
                            />
                          )
                        }
                        return (
                          <FormItem
                            className={
                              'multiline' in definition
                                ? 'lg:col-span-2'
                                : undefined
                            }
                          >
                            <FormLabel>{t(definition.label)}</FormLabel>
                            <FormControl>{input}</FormControl>
                            <FormMessage />
                          </FormItem>
                        )
                      }}
                    />
                  ))}
                </div>
                {callbackURL && (
                  <div className='text-muted-foreground bg-muted/40 flex min-w-0 items-center gap-2 rounded-md px-3 py-1 text-xs'>
                    <span className='flex-1 break-all'>
                      {callbackURL}/api/payment/official/{group.provider}/notify
                    </span>
                    <CopyButton
                      value={`${callbackURL}/api/payment/official/${group.provider}/notify`}
                    />
                  </div>
                )}
              </div>
            ))}
          </SettingsForm>
        </Form>
      </SettingsSection>
      <SecureVerificationDialog {...verification.dialogProps} />
    </>
  )
}
