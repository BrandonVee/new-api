import { createFileRoute } from '@tanstack/react-router'

import { LegalNotices } from '@/features/legal/notices'

export const Route = createFileRoute('/legal-notices')({
  component: LegalNotices,
})
