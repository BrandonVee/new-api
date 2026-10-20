import {
  ArrowRight01Icon,
  Image01Icon,
  Mic01Icon,
  Video01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export function Multimodal() {
  const { t } = useTranslation()
  const capabilities = [
    {
      id: 'image',
      title: t('Image creation'),
      description: t(
        'Turn ideas into visual assets for products, campaigns, and everyday creativity.'
      ),
      icon: Image01Icon,
    },
    {
      id: 'audio',
      title: t('Voice and audio'),
      description: t(
        'Connect speech generation and transcription to make your applications heard.'
      ),
      icon: Mic01Icon,
    },
    {
      id: 'video',
      title: t('Video generation'),
      description: t(
        'Explore video models for motion, storytelling, and new creative experiences.'
      ),
      icon: Video01Icon,
    },
  ]

  return (
    <section
      className='gateway-section'
      aria-labelledby='gateway-multimodal-title'
    >
      <div className='gateway-container'>
        <div className='gateway-section-heading'>
          <h2 id='gateway-multimodal-title'>{t('Go beyond text')}</h2>
          <p>
            {t(
              'Images, voice, and video. More ways to create, through a single gateway.'
            )}
          </p>
        </div>
        <div className='grid gap-6 md:grid-cols-3'>
          {capabilities.map((item) => (
            <Card
              key={item.id}
              className='gateway-capability-card gap-0 rounded-2xl pt-0'
            >
              <div
                className={`gateway-capability-art gateway-art-${item.id}`}
                aria-hidden='true'
              >
                <div className='gateway-art-panel'>
                  <HugeiconsIcon icon={item.icon} size={62} strokeWidth={1.2} />
                </div>
                <div className='gateway-art-orbit' />
                {item.id === 'audio' && (
                  <div className='gateway-waveform'>
                    {[20, 38, 58, 32, 74, 48, 90, 60, 36, 66, 42, 22].map(
                      (height) => (
                        <i key={height} style={{ height }} />
                      )
                    )}
                  </div>
                )}
                {item.id === 'image' && <div className='gateway-art-sun' />}
                {item.id === 'video' && (
                  <div className='gateway-art-frames'>
                    <i />
                    <i />
                  </div>
                )}
              </div>
              <CardHeader className='px-7 pt-6'>
                <h3 className='text-xl font-semibold'>{item.title}</h3>
              </CardHeader>
              <CardContent className='flex flex-1 flex-col items-start px-7'>
                <p className='text-muted-foreground mt-3 flex-1 text-sm leading-6'>
                  {item.description}
                </p>
                <Button
                  variant='link'
                  className='mt-5 h-auto min-h-8 px-0 text-left whitespace-normal'
                  render={<Link to='/pricing' />}
                >
                  {t('Explore models')}
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    data-icon='inline-end'
                    aria-hidden='true'
                  />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
