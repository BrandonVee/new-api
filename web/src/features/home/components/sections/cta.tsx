import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

interface CTAProps {
  isAuthenticated?: boolean
}

export function CTA(props: CTAProps) {
  const { t } = useTranslation()

  return (
    <section
      className='gateway-container gateway-cta'
      aria-labelledby='gateway-cta-title'
    >
      <div className='relative z-10 max-w-2xl'>
        <h2
          id='gateway-cta-title'
          className='text-2xl leading-snug font-bold tracking-tight sm:text-4xl'
        >
          {t('Your next AI application starts here')}
        </h2>
        <p className='text-muted-foreground mt-5 max-w-xl text-sm leading-7 sm:text-base'>
          {t(
            'One gateway for your models, your team, and your ideas. Start building with a unified API today.'
          )}
        </p>
        <div className='mt-7 flex flex-wrap gap-3'>
          <Button
            size='lg'
            className='gateway-action'
            render={
              <Link to={props.isAuthenticated ? '/dashboard' : '/sign-up'} />
            }
          >
            {props.isAuthenticated ? t('Go to Dashboard') : t('Get Started')}
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              data-icon='inline-end'
              aria-hidden='true'
            />
          </Button>
          <Button
            size='lg'
            variant='outline'
            className='gateway-action'
            render={<Link to='/pricing' />}
          >
            {t('Explore models')}
          </Button>
        </div>
      </div>
      <div className='gateway-cta-art' aria-hidden='true'>
        <span>AI</span>
        <div />
        <div />
      </div>
    </section>
  )
}
