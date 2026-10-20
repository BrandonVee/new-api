import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { DEFAULT_SYSTEM_NAME, PROJECT_MAINTAINER } from '@/lib/constants'

export function LegalNotices() {
  const { t } = useTranslation()

  return (
    <PublicLayout>
      <div className='mx-auto max-w-3xl space-y-8 py-12'>
        <div className='space-y-3'>
          <h1 className='text-3xl font-semibold tracking-tight'>
            {t('Legal Notices')}
          </h1>
        </div>
        <section className='space-y-3 rounded-2xl border p-6'>
          <h2 className='text-xl font-semibold'>{DEFAULT_SYSTEM_NAME}</h2>
          <p className='text-muted-foreground text-sm'>
            {t('Maintained by {{name}}', {
              name: PROJECT_MAINTAINER,
            })}
          </p>
        </section>
        <section className='space-y-3 rounded-2xl border p-6'>
          <h2 className='text-xl font-semibold'>{t('AGPL v3.0 License')}</h2>
          <p className='text-muted-foreground text-sm'>
            {t('This project must be used in compliance with the')}{' '}
            <a href='/LICENSE.txt' className='text-primary hover:underline'>
              {t('AGPL v3.0 License')}
            </a>
          </p>
          <div className='flex flex-wrap gap-4 text-sm'>
            <a href='/NOTICE.txt' className='text-primary hover:underline'>
              NOTICE
            </a>
            <a
              href='/THIRD-PARTY-LICENSES.md'
              className='text-primary hover:underline'
            >
              {t('Third-Party Licenses')}
            </a>
          </div>
        </section>
        <Button variant='outline' render={<Link to='/' />}>
          {t('Back to Home')}
        </Button>
      </div>
    </PublicLayout>
  )
}
