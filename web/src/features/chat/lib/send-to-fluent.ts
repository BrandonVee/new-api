export function sendToFluent(apiKey: string, serverAddress?: string): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const gatewayContainer = document.querySelector(
    '#fluent-ai-gateway-container'
  )
  // Older extension versions only expose their original integration bridge.
  const container =
    gatewayContainer ?? document.querySelector('#fluent-new-api-container')
  if (!container) {
    return false
  }

  const payload = {
    id: gatewayContainer ? 'ai-gateway' : 'new-api',
    baseUrl: serverAddress || window.location.origin,
    apiKey: apiKey.startsWith('sk-') ? apiKey : `sk-${apiKey}`,
  }

  container.dispatchEvent(
    new CustomEvent('fluent:prefill', {
      detail: payload,
    })
  )

  return true
}
