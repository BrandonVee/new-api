import { describe, expect, it } from 'vitest'

import {
  encodeChannelConnectionInfo,
  parseChannelConnectionInfo,
} from '@/lib/channel-connection-info'

describe('channel connection sharing', () => {
  it('exports connection details using the Ai-gateway identifier', () => {
    const encoded = encodeChannelConnectionInfo(
      'sk-test',
      'https://gateway.example'
    )

    expect(JSON.parse(encoded)).toEqual({
      _type: 'ai_gateway_channel_conn',
      key: 'sk-test',
      url: 'https://gateway.example',
    })
    expect(parseChannelConnectionInfo(encoded)).toEqual({
      key: 'sk-test',
      url: 'https://gateway.example',
    })
  })

  it('imports connection details copied from an older installation', () => {
    expect(
      parseChannelConnectionInfo(
        '{"_type":"newapi_channel_conn","key":"sk-legacy","url":"https://gateway.example"}'
      )
    ).toEqual({ key: 'sk-legacy', url: 'https://gateway.example' })
  })

  it.each([
    '',
    'not JSON',
    'null',
    '{"_type":"other","key":"sk-test","url":"https://gateway.example"}',
    '{"_type":"ai_gateway_channel_conn","url":"https://gateway.example"}',
    '{"_type":"ai_gateway_channel_conn","key":"sk-test","url":42}',
    '{"_type":"newapi_channel_conn","key":42,"url":"https://gateway.example"}',
  ])('rejects invalid connection details %j', (text) => {
    expect(parseChannelConnectionInfo(text)).toBeNull()
  })
})
