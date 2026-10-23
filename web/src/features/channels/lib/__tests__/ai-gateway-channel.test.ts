import { describe, expect, test } from 'vitest'

import type { TaskPluginOption } from '../../api'
import {
  CHANNEL_TYPE_AI_GATEWAY,
  CHANNEL_TYPE_VLLM,
  CHANNEL_TYPE_SGLANG,
  CHANNEL_TYPE_OPTIONS,
  MODEL_FETCHABLE_TYPES,
} from '../../constants'
import { channelSchema } from '../../types'
import {
  CHANNEL_FORM_DEFAULT_VALUES,
  channelFormSchema,
  transformChannelToFormDefaults,
  transformFormDataToCreatePayload,
} from '../channel-form'
import {
  getChannelPluginExtensions,
  readTaskExtendPluginKeys,
  supportsAiGatewayUpstream,
} from '../channel-plugin-extensions'
import { getChannelTypeConfig } from '../channel-type-config'
import { getChannelTypeIcon, getKeyPromptForType } from '../channel-utils'

function aiGatewayForm(baseUrl: string) {
  return {
    ...CHANNEL_FORM_DEFAULT_VALUES,
    name: 'Ai-gateway upstream',
    type: CHANNEL_TYPE_AI_GATEWAY,
    base_url: baseUrl,
    key: 'test-key',
    models: 'gpt-5',
  }
}

describe('Ai-gateway channel', () => {
  test('registers selection, ordering, model discovery, and icon metadata', () => {
    const option = CHANNEL_TYPE_OPTIONS.find(
      (item) => item.value === CHANNEL_TYPE_AI_GATEWAY
    )

    expect(option).toEqual({
      value: CHANNEL_TYPE_AI_GATEWAY,
      label: 'Ai-gateway',
    })
    expect(
      CHANNEL_TYPE_OPTIONS.findIndex(
        (item) => item.value === CHANNEL_TYPE_AI_GATEWAY
      ) + 1
    ).toBe(CHANNEL_TYPE_OPTIONS.findIndex((item) => item.value === 58))
    expect(MODEL_FETCHABLE_TYPES.has(CHANNEL_TYPE_AI_GATEWAY)).toBe(true)
    expect(getChannelTypeIcon(CHANNEL_TYPE_AI_GATEWAY)).toBe('AiGateway')
    expect(getKeyPromptForType(CHANNEL_TYPE_AI_GATEWAY)).toBe(
      'Enter API key for this channel'
    )
    expect(getChannelTypeConfig(CHANNEL_TYPE_AI_GATEWAY).icon).toBe('AiGateway')
  })

  test('requires a non-blank Base URL', () => {
    const blankResult = channelFormSchema.safeParse(aiGatewayForm('  '))

    expect(blankResult.success).toBe(false)
    if (!blankResult.success) {
      expect(
        blankResult.error.issues.some(
          (issue) =>
            issue.path[0] === 'base_url' &&
            issue.message === 'Base URL is required for this channel type'
        )
      ).toBe(true)
    }

    expect(
      channelFormSchema.safeParse(aiGatewayForm('https://ai-gateway.example'))
        .success
    ).toBe(true)
  })

  test('keeps Sub2API Base URL validation unchanged', () => {
    const result = channelFormSchema.safeParse({
      ...aiGatewayForm(''),
      type: 59,
    })

    expect(result.success).toBe(true)
  })
})

describe.each([
  { type: CHANNEL_TYPE_VLLM, name: 'vLLM', icon: 'Vllm' },
  { type: CHANNEL_TYPE_SGLANG, name: 'SGLang', icon: 'SGLang' },
])('$name channel', ({ type, name, icon }) => {
  test('can be selected and discover served models', () => {
    expect(CHANNEL_TYPE_OPTIONS).toContainEqual({
      value: type,
      label: name,
    })
    expect(MODEL_FETCHABLE_TYPES.has(type)).toBe(true)
    expect(getChannelTypeIcon(type)).toBe(icon)
    expect(getChannelTypeConfig(type).icon).toBe(icon)
    expect(getKeyPromptForType(type)).toBe(
      `${name} API key, or EMPTY if authentication is disabled`
    )
  })

  test('requires an upstream address and submits the served model name', () => {
    const form = {
      ...aiGatewayForm(''),
      type,
      models: 'deepseek-v4-flash-vision-exp',
      key: 'EMPTY',
    }
    const blank = channelFormSchema.safeParse(form)
    expect(blank.success).toBe(false)
    if (!blank.success) {
      expect(blank.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['base_url'],
            message: 'Base URL is required for this channel type',
          }),
        ])
      )
    }
    const parsed = channelFormSchema.parse({
      ...form,
      base_url: 'http://vllm:8000/',
    })
    const payload = transformFormDataToCreatePayload(parsed)
    expect(payload.channel).toMatchObject({
      type,
      base_url: 'http://vllm:8000',
      models: 'deepseek-v4-flash-vision-exp',
      key: 'EMPTY',
    })
  })
})

describe('Ai-gateway channel task plugin extensions', () => {
  const plugins: TaskPluginOption[] = [
    {
      key: 'doubao',
      name: 'Doubao',
      models: ['seedance'],
      channelTypes: [45],
      upstreams: ['vendor', 'ai_gateway'],
    },
    {
      key: 'kling',
      name: 'Kling',
      models: ['kling-v2'],
      upstreams: ['ai_gateway'],
    },
    {
      key: 'acme',
      name: 'Acme',
      models: ['acme-video'],
      upstreams: ['vendor'],
    },
  ]

  test('only plugins declaring a Ai-gateway upstream can be bound to a Ai-gateway channel', () => {
    expect(plugins.filter(supportsAiGatewayUpstream).map((p) => p.key)).toEqual(
      ['doubao', 'kling']
    )
    expect(supportsAiGatewayUpstream({ upstreams: ['new_api'] })).toBe(false)
    expect(supportsAiGatewayUpstream({ upstreams: null })).toBe(false)
    expect(supportsAiGatewayUpstream({})).toBe(false)
  })

  test('reads the extension list together with a single key on Ai-gateway channels only', () => {
    expect(
      readTaskExtendPluginKeys(CHANNEL_TYPE_AI_GATEWAY, {
        task_plugin_key: 'kling',
        task_extend_plugin_keys: ['doubao', 'kling', '', 'doubao'],
      })
    ).toEqual(['kling', 'doubao'])
    expect(readTaskExtendPluginKeys(CHANNEL_TYPE_AI_GATEWAY, {})).toEqual([])
    expect(
      readTaskExtendPluginKeys(1, { task_extend_plugin_keys: ['doubao'] })
    ).toEqual([])
  })

  test('lists only bound plugins as extensions while other types keep declared channel types', () => {
    expect(
      getChannelPluginExtensions(CHANNEL_TYPE_AI_GATEWAY, plugins, ['kling'])
    ).toEqual([plugins[1]])
    expect(
      getChannelPluginExtensions(CHANNEL_TYPE_AI_GATEWAY, plugins)
    ).toEqual([])
    expect(getChannelPluginExtensions(45, plugins, ['kling'])).toEqual([
      plugins[0],
    ])
  })

  test('round-trips bound plugins through the channel setting for Ai-gateway channels only', () => {
    const channel = channelSchema.parse({
      id: 7,
      name: 'Gateway',
      type: CHANNEL_TYPE_AI_GATEWAY,
      key: '',
      status: 1,
      created_time: 1,
      test_time: 0,
      response_time: 0,
      balance_updated_time: 0,
      models: 'seedance',
      group: 'default',
      base_url: 'https://gateway.example',
      setting: JSON.stringify({
        task_plugin_key: 'kling',
        task_extend_plugin_keys: ['doubao'],
      }),
    })
    expect(
      transformChannelToFormDefaults(channel).task_extend_plugin_keys
    ).toEqual(['kling', 'doubao'])

    const gateway = transformFormDataToCreatePayload(
      channelFormSchema.parse({
        ...aiGatewayForm('https://gateway.example'),
        task_extend_plugin_keys: ['doubao', 'kling'],
      })
    )
    const gatewaySetting = JSON.parse(gateway.channel.setting ?? '{}')
    expect(gatewaySetting).toMatchObject({
      task_extend_plugin_keys: ['doubao', 'kling'],
    })
    expect(gatewaySetting).not.toHaveProperty('task_plugin_key')

    const openai = transformFormDataToCreatePayload(
      channelFormSchema.parse({
        ...aiGatewayForm('https://gateway.example'),
        type: 1,
        task_extend_plugin_keys: ['doubao'],
      })
    )
    expect(JSON.parse(openai.channel.setting ?? '{}')).not.toHaveProperty(
      'task_extend_plugin_keys'
    )
  })
})
