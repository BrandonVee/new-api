import { ArrowRight01Icon, BookOpen01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'
import { resolveDocsLink } from '@/lib/constants'

import { GatewayVisual } from '../gateway-visual'

interface HeroProps {
  isAuthenticated?: boolean
}

export function Hero(props: HeroProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const docsUrl = resolveDocsLink(status?.docs_link)

  return (
    <section className='gateway-hero' aria-labelledby='gateway-title'>
      <div className='gateway-container grid items-center gap-8 lg:grid-cols-2'>
        <div className='relative z-10 min-w-0 py-5 lg:py-10'>
          <h1 id='gateway-title' className='gateway-hero-title'>
            {t('One platform for AI models')}
            <br />
            {t('Access, manage, and build')}
          </h1>
          <p className='mt-6 text-lg font-medium sm:text-xl'>
            {t('Simpler access. Smarter possibilities.')}
          </p>
          <p className='text-muted-foreground mt-4 max-w-xl text-sm leading-7 sm:text-base'>
            {t(
              'Connect leading models through one API. Manage access, route requests, and bring your next AI application to life.'
            )}
          </p>
          <dl className='gateway-hero-facts mt-7 flex flex-wrap gap-x-8 gap-y-4'>
            <div>
              <dt>OpenAI</dt>
              <dd>{t('API compatible')}</dd>
            </div>
            <div>
              <dt>{t('Multi-model')}</dt>
              <dd>{t('One integration')}</dd>
            </div>
            <div>
              <dt>Stream</dt>
              <dd>{t('Streaming responses')}</dd>
            </div>
          </dl>
          <div className='mt-8 flex flex-wrap gap-3'>
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
            <Button
              size='lg'
              variant='ghost'
              className='gateway-action'
              render={
                docsUrl.startsWith('http') ? (
                  <a href={docsUrl} target='_blank' rel='noopener noreferrer' />
                ) : (
                  <Link to={docsUrl} />
                )
              }
            >
              <HugeiconsIcon
                icon={BookOpen01Icon}
                data-icon='inline-start'
                aria-hidden='true'
              />
              {t('Docs')}
            </Button>
          </div>
          <div className='gateway-apps mt-8'>
            <p className='text-xs font-medium'>{t('Supported Applications')}</p>
            <div className='mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm'>
              <a
                href='https://cherry-ai.com'
                target='_blank'
                rel='noopener noreferrer'
              >
                Cherry Studio
              </a>
              <a
                href='https://ccswitch.io'
                target='_blank'
                rel='noopener noreferrer'
              >
                CC Switch
              </a>
              <span>{t('More Apps')}</span>
            </div>
            <p className='mt-2 max-w-md text-xs leading-5'>
              {t(
                'Supports one-click configuration and works with Ai-Gateway multi-protocol settings.'
              )}
            </p>
          </div>
        </div>
        <GatewayVisual />
      </div>
    </section>
  )
}
