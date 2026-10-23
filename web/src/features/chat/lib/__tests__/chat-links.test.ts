import { afterEach, describe, expect, it } from 'vitest'

import { resolveChatUrl } from '../chat-links'
import { sendToFluent } from '../send-to-fluent'

afterEach(() => {
  document.body.replaceChildren()
})

describe('chat client configuration', () => {
  it('imports Cherry Studio as a named OpenAI-compatible gateway provider', () => {
    const result = resolveChatUrl({
      template: 'cherrystudio://providers/api-keys?v=1&data={cherryConfig}',
      apiKey: 'test-key',
      serverAddress: 'https://gateway.example',
    })
    const data = new URL(result).searchParams.get('data')
    expect(JSON.parse(atob(data ?? ''))).toEqual({
      id: 'ai-gateway',
      name: 'Ai-gateway',
      type: 'openai',
      baseUrl: 'https://gateway.example',
      apiKey: 'sk-test-key',
    })
  })

  it.each(['test-key', 'sk-test-key'])(
    'uses AionUi custom import with gateway credentials %s',
    (apiKey) => {
      const result = resolveChatUrl({
        template: 'aionui://provider/add?data={aionuiConfig}',
        apiKey,
        serverAddress: 'https://gateway.example',
      })
      const data = new URL(result).searchParams.get('data')
      expect(data).not.toBeNull()
      expect(JSON.parse(atob(data ?? ''))).toEqual({
        platform: 'custom',
        name: 'Ai-gateway',
        base_url: 'https://gateway.example',
        api_key: 'sk-test-key',
      })
    }
  )

  it('uses DeepChat custom provider import instead of a built-in provider ID', () => {
    const result = resolveChatUrl({
      template: 'deepchat://provider/install?data={deepchatConfig}',
      apiKey: 'test-key',
      serverAddress: 'https://gateway.example',
    })
    const data = new URL(result).searchParams.get('data')
    expect(data).not.toBeNull()
    expect(JSON.parse(atob(data ?? ''))).toEqual({
      name: 'Ai-gateway',
      type: 'openai-compatible',
      baseUrl: 'https://gateway.example',
      apiKey: 'sk-test-key',
    })
  })

  it('sends gateway identity to a compatible Fluent bridge', () => {
    const container = document.createElement('div')
    container.id = 'fluent-ai-gateway-container'
    document.body.append(container)
    const received: unknown[] = []
    container.addEventListener('fluent:prefill', (event) => {
      received.push((event as CustomEvent<unknown>).detail)
    })

    expect(sendToFluent('sk-test-key', 'https://gateway.example')).toBe(true)
    expect(received).toEqual([
      {
        id: 'ai-gateway',
        baseUrl: 'https://gateway.example',
        apiKey: 'sk-test-key',
      },
    ])
  })

  it('keeps installed Fluent extensions working with their original bridge', () => {
    const container = document.createElement('div')
    container.id = 'fluent-new-api-container'
    document.body.append(container)
    const received: unknown[] = []
    container.addEventListener('fluent:prefill', (event) => {
      received.push((event as CustomEvent<unknown>).detail)
    })

    expect(sendToFluent('test-key', 'https://gateway.example')).toBe(true)
    expect(received).toEqual([
      {
        id: 'new-api',
        baseUrl: 'https://gateway.example',
        apiKey: 'sk-test-key',
      },
    ])
  })

  it('prefers the gateway Fluent bridge when both versions are present', () => {
    for (const id of [
      'fluent-new-api-container',
      'fluent-ai-gateway-container',
    ]) {
      const container = document.createElement('div')
      container.id = id
      document.body.append(container)
    }
    const recipients: string[] = []
    document.body.addEventListener(
      'fluent:prefill',
      (event) => {
        recipients.push((event.target as Element).id)
      },
      { capture: true, once: true }
    )

    expect(sendToFluent('test-key')).toBe(true)
    expect(recipients).toEqual(['fluent-ai-gateway-container'])
  })

  it('reports an unavailable Fluent bridge without dispatching credentials', () => {
    expect(sendToFluent('test-key')).toBe(false)
  })
})
