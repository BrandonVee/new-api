import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

export function PriceComparison(props: {
  price: string
  originalPrice?: string
  unit?: string
  className?: string
}) {
  const { t } = useTranslation()
  const showOriginal =
    Boolean(props.originalPrice) &&
    props.originalPrice !== '-' &&
    props.originalPrice !== props.price

  return (
    <span
      className={cn(
        'inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1.5 font-mono text-sm break-words whitespace-normal tabular-nums',
        props.className
      )}
    >
      {showOriginal && (
        <s
          className='text-muted-foreground min-w-0 text-xs font-normal [overflow-wrap:anywhere]'
          aria-label={t('Original price: {{price}}', {
            price: props.originalPrice,
          })}
          title={t('Original price: {{price}}', {
            price: props.originalPrice,
          })}
        >
          {props.originalPrice}
        </s>
      )}
      <span
        className='min-w-0 [overflow-wrap:anywhere]'
        title={
          showOriginal
            ? t('Group price: {{price}}', { price: props.price })
            : undefined
        }
      >
        {props.price}
        {props.unit && (
          <span className='text-muted-foreground text-xs font-normal whitespace-nowrap'>
            {' '}
            / {props.unit}
          </span>
        )}
      </span>
    </span>
  )
}
