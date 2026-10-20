import { Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { CodeBlockFrame } from '@/components/ai-elements/code-block-frame'
import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'

interface HowItWorksProps {
  baseUrl: string
  isAuthenticated?: boolean
}

export function HowItWorks(props: HowItWorksProps) {
  const { t } = useTranslation()
  const baseUrl = props.baseUrl.replace(/\/+$/, '')
  const endpoint = `${baseUrl}/v1`
  const code = [
    'from openai import OpenAI',
    '',
    'client = OpenAI(',
    `    base_url=${JSON.stringify(endpoint)},`,
    '    api_key="YOUR_API_KEY",',
    ')',
    '',
    'response = client.chat.completions.create(',
    '    model="YOUR_MODEL_NAME",',
    '    messages=[{"role": "user", "content": "Hello!"}],',
    ')',
    '',
    'print(response.choices[0].message.content)',
  ].join('\n')
  const steps = [
    {
      title: t('Create your account'),
      description: t('Open your console and get ready to connect.'),
    },
    {
      title: t('Get your API key'),
      description: t(
        'Create a key in the console and choose your access settings.'
      ),
    },
    {
      title: t('Make your first request'),
      description: t(
        'Set your base URL, choose an available model, and keep the SDK you already use.'
      ),
    },
  ]

  return (
    <section
      id='get-started'
      className='gateway-section'
      aria-labelledby='gateway-start-title'
    >
      <div className='gateway-container'>
        <div className='gateway-section-heading'>
          <h2 id='gateway-start-title'>{t('Three steps to get started')}</h2>
          <p>
            {t(
              'From your first API key to your first response, without the extra work.'
            )}
          </p>
        </div>
        <div className='grid min-w-0 items-center gap-10 lg:grid-cols-2 lg:gap-20'>
          <div className='min-w-0'>
            <ol className='gateway-steps flex flex-col gap-7'>
              {steps.map((step, index) => (
                <li key={step.title} className='flex items-start gap-5'>
                  <span
                    className='gateway-step-number shrink-0'
                    aria-hidden='true'
                  >
                    {index + 1}
                  </span>
                  <div className='min-w-0 pt-1'>
                    <h3 className='text-base font-semibold sm:text-lg'>
                      {step.title}
                    </h3>
                    <p className='text-muted-foreground mt-2 text-sm leading-6'>
                      {step.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <div className='gateway-endpoint mt-8 flex min-w-0 items-center gap-2 rounded-xl px-4 py-3'>
              <span className='shrink-0 text-xs font-medium'>
                {t('Base URL')}
              </span>
              <code
                className='min-w-0 flex-1 overflow-x-auto text-xs'
                tabIndex={0}
              >
                {endpoint}
              </code>
              <CopyButton
                value={endpoint}
                aria-label={t('Copy base URL')}
                className='size-8'
              />
            </div>
            <ul className='mt-6 grid gap-3 text-sm sm:grid-cols-2'>
              {[
                t('OpenAI SDK compatible'),
                t('Streaming responses'),
                t('Switch models with one parameter'),
                t('Keep your existing workflow'),
              ].map((item) => (
                <li key={item} className='flex items-start gap-2'>
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    className='text-primary mt-0.5 size-4 shrink-0'
                    aria-hidden='true'
                  />
                  {item}
                </li>
              ))}
            </ul>
            <Button
              variant='link'
              className='mt-5 px-0'
              render={
                <Link to={props.isAuthenticated ? '/keys' : '/sign-in'} />
              }
            >
              {t('Get your API key')}
            </Button>
          </div>
          <CodeBlockFrame
            className='gateway-code-demo min-w-0'
            showToolbar
            title='quickstart.py'
            endActions={<CopyButton value={code} aria-label={t('Copy code')} />}
          >
            <pre
              className='p-5 text-xs leading-7 sm:p-7 sm:text-sm'
              tabIndex={0}
              aria-label={t('Python integration example')}
            >
              <code>{code}</code>
            </pre>
          </CodeBlockFrame>
        </div>
      </div>
    </section>
  )
}
