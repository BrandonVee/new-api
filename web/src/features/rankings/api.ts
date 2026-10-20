import { api } from '@/lib/api'
import { createServerError } from '@/lib/server-error-message'

import type { RankingPeriod, RankingsSnapshot } from './types'

type RankingsResponse = {
  success: boolean
  message?: string
  data: RankingsSnapshot
}

export async function getRankings(
  period: RankingPeriod
): Promise<RankingsResponse> {
  const res = await api.get<RankingsResponse>('/api/rankings', {
    params: { period },
  })
  const response = res.data
  const snapshot = response?.data

  // A successful envelope is not enough: the charts require both history
  // series and the leaderboard lists, including when there is no traffic.
  if (
    response?.success &&
    (!snapshot ||
      !Array.isArray(snapshot.models) ||
      !Array.isArray(snapshot.vendors) ||
      !Array.isArray(snapshot.top_movers) ||
      !Array.isArray(snapshot.top_droppers) ||
      !Array.isArray(snapshot.models_history?.models) ||
      !Array.isArray(snapshot.models_history?.points) ||
      !Array.isArray(snapshot.vendor_share_history?.vendors) ||
      !Array.isArray(snapshot.vendor_share_history?.points))
  ) {
    throw createServerError({ message_key: 'Unable to load rankings data' })
  }

  return response
}
