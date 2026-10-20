import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getLobeIcon } from '@/lib/lobe-icon'

export function ModelShowcase() {
  const { t } = useTranslation()
  const categories = [
    { id: 'all', label: t('All') },
    { id: 'text', label: t('Text') },
    { id: 'reasoning', label: t('Reasoning') },
    { id: 'code', label: t('Code') },
    { id: 'multimodal', label: t('Multimodal') },
  ]
  const models = [
    {
      name: 'DeepSeek',
      icon: 'DeepSeek.Color',
      search: 'deepseek',
      categories: ['text', 'reasoning', 'code'],
      description: t(
        'Explore models for everyday conversations, complex reasoning, and coding workflows.'
      ),
    },
    {
      name: 'Qwen',
      icon: 'Qwen.Color',
      search: 'qwen',
      categories: ['text', 'code', 'multimodal'],
      description: t(
        'Bring language, code, and visual understanding into your applications.'
      ),
    },
    {
      name: 'Claude',
      icon: 'Claude.Color',
      search: 'claude',
      categories: ['text', 'reasoning', 'code', 'multimodal'],
      description: t(
        'Build with models for thoughtful conversations, document analysis, and development.'
      ),
    },
    {
      name: 'Gemini',
      icon: 'Gemini.Color',
      search: 'gemini',
      categories: ['text', 'reasoning', 'multimodal'],
      description: t(
        'Connect multimodal understanding with your ideas, documents, and creative workflows.'
      ),
    },
  ]

  return (
    <section
      id='models'
      className='gateway-section gateway-models'
      aria-labelledby='gateway-models-title'
    >
      <div className='gateway-container'>
        <div className='gateway-section-heading'>
          <h2 id='gateway-models-title'>
            {t('Leading models. One familiar API.')}
          </h2>
          <p>
            {t(
              'Find the right model for your next idea, from text and code to multimodal experiences.'
            )}
          </p>
        </div>
        <Tabs defaultValue='all' className='gap-7'>
          <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
            <div className='min-w-0 overflow-x-auto pb-1'>
              <TabsList
                className='gateway-model-tabs h-auto'
                aria-label={t('Model categories')}
              >
                {categories.map((category) => (
                  <TabsTrigger key={category.id} value={category.id}>
                    {category.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <Button
              variant='link'
              className='self-start px-0 sm:self-auto'
              render={<Link to='/pricing' />}
            >
              {t('Explore models')}
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                data-icon='inline-end'
                aria-hidden='true'
              />
            </Button>
          </div>
          {categories.map((category) => (
            <TabsContent key={category.id} value={category.id}>
              <div className='grid gap-5 sm:grid-cols-2 xl:grid-cols-4'>
                {models
                  .filter(
                    (model) =>
                      category.id === 'all' ||
                      model.categories.includes(category.id)
                  )
                  .map((model) => (
                    <Card
                      key={model.name}
                      className='gateway-model-card h-full gap-5 rounded-2xl py-6'
                    >
                      <CardHeader className='gap-4 px-6'>
                        <div className='flex items-center gap-3'>
                          <div
                            className='gateway-model-icon flex size-12 shrink-0 items-center justify-center rounded-xl'
                            aria-hidden='true'
                          >
                            {getLobeIcon(model.icon, 32)}
                          </div>
                          <h3 className='text-lg font-semibold'>
                            {model.name}
                          </h3>
                        </div>
                        <p className='text-muted-foreground min-h-18 text-sm leading-6'>
                          {model.description}
                        </p>
                      </CardHeader>
                      <CardContent className='flex flex-1 flex-wrap items-start gap-2 px-6'>
                        {categories
                          .filter((tag) => model.categories.includes(tag.id))
                          .slice(0, 3)
                          .map((tag) => (
                            <Badge key={tag.id} variant='secondary'>
                              {tag.label}
                            </Badge>
                          ))}
                      </CardContent>
                      <CardFooter className='flex-col items-stretch gap-4 px-6 py-4'>
                        <p className='text-muted-foreground text-xs'>
                          {t(
                            'See available models and current pricing in the catalog.'
                          )}
                        </p>
                        <Button
                          variant='outline'
                          className='h-auto min-h-10 w-full whitespace-normal'
                          render={
                            <Link
                              to='/pricing'
                              search={{ search: model.search }}
                            />
                          }
                        >
                          {t('View available models')}
                          <HugeiconsIcon
                            icon={ArrowRight01Icon}
                            data-icon='inline-end'
                            aria-hidden='true'
                          />
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
        <p className='text-muted-foreground mt-6 text-center text-xs leading-5'>
          {t(
            'Model availability depends on the channels configured for this site.'
          )}
        </p>
      </div>
    </section>
  )
}
