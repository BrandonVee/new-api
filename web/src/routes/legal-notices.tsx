import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/legal-notices')({
  beforeLoad: () => {
    throw redirect({ to: '/usage-guidelines', replace: true })
  },
})
