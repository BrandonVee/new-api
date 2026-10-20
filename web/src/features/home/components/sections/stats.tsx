import { useTranslation } from 'react-i18next'

export function Stats() {
  const { t } = useTranslation()
  const highlights = [
    {
      value: 'OpenAI / Claude / Gemini',
      label: t('Multi-protocol Compatible'),
    },
    { value: t('Multi-model'), label: t('One integration') },
    { value: t('Real-time visibility'), label: t('Track every request') },
    { value: t('Open Source'), label: t('Deploy on your terms') },
  ]

  return (
    <div className='gateway-container relative z-10'>
      <dl className='gateway-highlights grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-4'>
        {highlights.map((item) => (
          <div key={item.label} className='min-w-0 text-center'>
            <dt className='gateway-highlight-value'>{item.value}</dt>
            <dd className='text-muted-foreground mt-2 text-xs sm:text-sm'>
              {item.label}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
