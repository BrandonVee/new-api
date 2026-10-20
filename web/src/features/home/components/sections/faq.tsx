import { useTranslation } from 'react-i18next'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

export function HomeFAQ() {
  const { t } = useTranslation()
  const questions = [
    {
      id: 'sdk',
      question: t('Can I keep using the OpenAI SDK?'),
      answer: t(
        'Yes. Set the base URL to this site, use a key from your console, and select an available model. You can keep the SDK workflow you already know.'
      ),
    },
    {
      id: 'models',
      question: t('Which models can I use?'),
      answer: t(
        'The model catalog lists the models available on this site. Availability and pricing follow the channels and settings configured by the administrator.'
      ),
    },
    {
      id: 'stream',
      question: t('Are streaming responses supported?'),
      answer: t(
        'Streaming is available for supported models and API routes. Enable streaming in your SDK request to receive the response as it is generated.'
      ),
    },
    {
      id: 'logs',
      question: t('Where can I check my usage?'),
      answer: t(
        'Open the console to review your request logs and usage statistics. You can also manage your API keys and access settings there.'
      ),
    },
  ]

  return (
    <section className='gateway-section' aria-labelledby='gateway-faq-title'>
      <div className='gateway-container grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20'>
        <div className='gateway-section-heading mb-0 text-left'>
          <h2 id='gateway-faq-title'>{t('Frequently asked questions')}</h2>
          <p>{t('A few things to know before your first request.')}</p>
        </div>
        <Accordion className='gateway-faq min-w-0' defaultValue={['sdk']}>
          {questions.map((item) => (
            <AccordionItem key={item.id} value={item.id}>
              <AccordionTrigger className='gap-5 py-5 text-base leading-6 hover:no-underline'>
                {item.question}
              </AccordionTrigger>
              <AccordionContent className='text-muted-foreground pr-8 pb-6 leading-7'>
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}
