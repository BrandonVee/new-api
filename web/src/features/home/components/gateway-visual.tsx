import gatewayScene from '@/assets/gateway-scene.svg'

import { IconCard } from './icon-card'

const providers = [
  { name: 'OpenAI', icon: 'OpenAI', position: 'gateway-node-openai' },
  { name: 'Claude', icon: 'Claude.Color', position: 'gateway-node-claude' },
  { name: 'Gemini', icon: 'Gemini.Color', position: 'gateway-node-gemini' },
  {
    name: 'DeepSeek',
    icon: 'DeepSeek.Color',
    position: 'gateway-node-deepseek',
  },
]

export function GatewayVisual() {
  return (
    <div className='gateway-visual' aria-hidden='true'>
      <img
        src={gatewayScene}
        alt=''
        width={720}
        height={640}
        fetchPriority='high'
        className='gateway-scene'
      />
      {providers.map((provider) => (
        <div
          key={provider.name}
          className={`gateway-provider-node ${provider.position}`}
        >
          <IconCard
            iconName={provider.icon}
            size={30}
            className='gateway-provider-icon'
          />
          <span>{provider.name}</span>
        </div>
      ))}
    </div>
  )
}
