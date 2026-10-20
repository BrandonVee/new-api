import {
  Analytics01Icon,
  CodeIcon,
  Route01Icon,
  Shield01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export function Features() {
  const { t } = useTranslation()
  const features = [
    {
      id: 'access',
      title: t('One integration, more possibilities'),
      description: t(
        'Use compatible API routes to connect your favorite SDKs and applications without managing each provider separately.'
      ),
      icon: CodeIcon,
      labels: ['OpenAI', 'Claude', 'Gemini'],
    },
    {
      id: 'routing',
      title: t('Route with confidence'),
      description: t(
        'Configure channels, priorities, and retries to keep requests moving across your model services.'
      ),
      icon: Route01Icon,
      labels: [t('Load Balancing'), t('Automatic retries')],
    },
    {
      id: 'control',
      title: t('Access on your terms'),
      description: t(
        'Manage API keys, model access, and usage limits from a single console as your team grows.'
      ),
      icon: Shield01Icon,
      labels: [t('Token Mgmt'), t('Rate Limiting')],
    },
    {
      id: 'insights',
      title: t('See every request clearly'),
      description: t(
        'Review request logs and usage trends in one place to understand how your applications use AI.'
      ),
      icon: Analytics01Icon,
      labels: [t('Observability'), t('Usage statistics')],
    },
  ]

  return (
    <section
      className='gateway-section gateway-feature-section'
      aria-labelledby='gateway-features-title'
    >
      <div className='gateway-container'>
        <div className='gateway-section-heading'>
          <h2 id='gateway-features-title'>
            {t('Built for your AI applications')}
          </h2>
          <p>
            {t(
              'The tools you need to connect, operate, and grow, all in one place.'
            )}
          </p>
        </div>
        <div className='grid gap-6 md:grid-cols-2'>
          {features.map((feature) => (
            <Card
              key={feature.id}
              className='gateway-feature-card rounded-2xl p-3 sm:p-5'
            >
              <CardHeader className='gap-4'>
                <div className='gateway-feature-icon flex size-12 items-center justify-center rounded-xl'>
                  <HugeiconsIcon
                    icon={feature.icon}
                    size={24}
                    strokeWidth={1.5}
                    aria-hidden='true'
                  />
                </div>
                <h3 className='text-lg font-semibold sm:text-xl'>
                  {feature.title}
                </h3>
              </CardHeader>
              <CardContent>
                <p className='text-muted-foreground max-w-xl text-sm leading-7'>
                  {feature.description}
                </p>
                <div className='mt-6 flex flex-wrap gap-2'>
                  {feature.labels.map((label) => (
                    <Badge key={label} variant='outline'>
                      {label}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
