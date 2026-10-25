import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useSystemConfigStore } from '@/stores/system-config-store'

import { DEFAULT_TOKEN_UNIT } from '../constants'
import { useBillingTime } from '../hooks/use-billing-time'
import {
  getDynamicDisplayGroupRatio,
  getDynamicPricingSummary,
  isUnconfiguredTaskUsageModel,
} from '../lib/dynamic-price'
import { isTokenBasedModel } from '../lib/model-helpers'
import { formatPrice, stripTrailingZeros } from '../lib/price'
import type { PricingModel } from '../types'
import type { ModelPriceCellOptions } from './model-price-cell'
import { PriceComparison } from './price-comparison'

export function CachedPriceCell(props: {
  model: PricingModel
  options: ModelPriceCellOptions
}) {
  const { t } = useTranslation()
  const {
    tokenUnit = DEFAULT_TOKEN_UNIT,
    priceRate = 1,
    usdExchangeRate = 1,
    showRechargePrice = false,
    selectedGroup,
  } = props.options

  const tokenUnitLabel = tokenUnit === 'K' ? '1K' : '1M'

  const model = props.model
  const currency = useSystemConfigStore((state) => state.config.currency)
  const billingTime = useBillingTime(model.billing_expr)
  const { dynamicSummary, originalSummary } = useMemo(
    () => {
      const priceOptions = {
        now: new Date(billingTime ?? Date.now()),
        tokenUnit,
        showRechargePrice,
        priceRate,
        usdExchangeRate,
        groupRatioMultiplier: getDynamicDisplayGroupRatio(model, selectedGroup),
      }
      const dynamicSummary = getDynamicPricingSummary(model, priceOptions)
      const originalSummary =
        dynamicSummary && priceOptions.groupRatioMultiplier !== 1
          ? getDynamicPricingSummary(model, {
              ...priceOptions,
              groupRatioMultiplier: 1,
            })
          : dynamicSummary
      return { dynamicSummary, originalSummary }
    },
    // Currency is read indirectly by the price formatter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      model,
      tokenUnit,
      showRechargePrice,
      priceRate,
      usdExchangeRate,
      selectedGroup,
      billingTime,
      currency,
    ]
  )

  if (dynamicSummary) {
    if (dynamicSummary.isSpecialExpression) {
      return (
        <span className='text-muted-foreground/50 text-xs'>
          {t('Special billing expression')}
        </span>
      )
    }

    const cacheEntries = dynamicSummary.entries.filter(
      (entry) =>
        entry.field === 'cacheReadPrice' || entry.field === 'imageCachePrice'
    )
    if (!cacheEntries.length) {
      return <span className='text-muted-foreground/30 text-xs'>—</span>
    }

    return (
      <div className='max-w-full min-w-0'>
        {cacheEntries.map((entry) => {
          const originalEntry = originalSummary?.entries.find(
            (original) => original.key === entry.key
          )
          return (
            <div
              key={entry.field}
              className='flex flex-wrap items-baseline gap-x-1'
            >
              {(cacheEntries.length > 1 ||
                entry.field === 'imageCachePrice') && (
                <span className='text-muted-foreground text-xs'>
                  {entry.field === 'imageCachePrice'
                    ? t('Image Cache')
                    : t('Cache Read')}
                </span>
              )}
              <PriceComparison
                price={stripTrailingZeros(entry.formatted)}
                originalPrice={
                  originalEntry
                    ? stripTrailingZeros(originalEntry.formatted)
                    : undefined
                }
              />
            </div>
          )
        })}
        <div className='text-muted-foreground/50 text-[10px]'>
          / {tokenUnitLabel}
        </div>
      </div>
    )
  }

  if (isUnconfiguredTaskUsageModel(model)) {
    return <span className='text-muted-foreground/30 text-xs'>—</span>
  }

  const isTokenBased = isTokenBasedModel(model)

  if (!isTokenBased || model.cache_ratio == null) {
    return <span className='text-muted-foreground/30 text-xs'>—</span>
  }

  const cachedPrice = stripTrailingZeros(
    formatPrice(
      model,
      'cache',
      tokenUnit,
      showRechargePrice,
      priceRate,
      usdExchangeRate,
      selectedGroup
    )
  )
  const originalCachedPrice = stripTrailingZeros(
    formatPrice(
      model,
      'cache',
      tokenUnit,
      showRechargePrice,
      priceRate,
      usdExchangeRate,
      undefined,
      true,
      1
    )
  )

  return (
    <div className='max-w-full min-w-0'>
      <PriceComparison
        price={cachedPrice}
        originalPrice={originalCachedPrice}
      />
      <div className='text-muted-foreground/50 text-[10px]'>
        / {tokenUnitLabel}
      </div>
    </div>
  )
}
