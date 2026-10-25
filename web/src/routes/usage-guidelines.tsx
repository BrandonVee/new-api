import { createFileRoute } from '@tanstack/react-router'

import { UsageGuidelines } from '@/features/legal/usage-guidelines'

export const Route = createFileRoute('/usage-guidelines')({
  component: UsageGuidelines,
})
