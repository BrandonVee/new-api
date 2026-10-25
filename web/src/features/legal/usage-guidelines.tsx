import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'

export function UsageGuidelines() {
  const { t } = useTranslation()
  const guidelines = [
    {
      title: t('Authorized use'),
      description: t(
        'Use only services and data you are authorized to access. Follow applicable laws and the policies of the model providers.'
      ),
    },
    {
      title: t('Protect your account and API keys'),
      description: t(
        'Keep passwords and API keys private. Do not share credentials or use another person’s account without permission.'
      ),
    },
    {
      title: t('Respect service limits'),
      description: t(
        'Follow rate limits and quotas. Do not attack, disrupt, or attempt to bypass service restrictions.'
      ),
    },
    {
      title: t('Protect privacy and respect others’ rights'),
      description: t(
        'Do not upload personal, confidential, or copyrighted data unless you have permission to use it.'
      ),
    },
    {
      title: t('Use AI outputs responsibly'),
      description: t(
        'Review model outputs before relying on or sharing them. You are responsible for the content you submit and how you use the results.'
      ),
    },
  ]

  return (
    <PublicLayout>
      <article className='mx-auto max-w-3xl space-y-8 py-10 sm:py-12'>
        <header className='space-y-3'>
          <h1 className='text-3xl font-semibold tracking-tight'>
            {t('Usage Guidelines')}
          </h1>
          <p className='text-muted-foreground text-sm leading-7'>
            {t(
              'Use this service responsibly to keep access secure, reliable, and fair for everyone.'
            )}
          </p>
        </header>
        <div className='divide-border divide-y'>
          {guidelines.map((guideline) => (
            <section
              key={guideline.title}
              className='py-6 first:pt-0 last:pb-0'
            >
              <h2 className='text-base font-semibold'>{guideline.title}</h2>
              <p className='text-muted-foreground mt-2 text-sm leading-7'>
                {guideline.description}
              </p>
            </section>
          ))}
        </div>
        <Button variant='outline' render={<Link to='/' />}>
          {t('Back to Home')}
        </Button>
      </article>
    </PublicLayout>
  )
}
