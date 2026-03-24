import { getAuthFromCookies } from '@open-mercato/shared/lib/auth/server'
import { redirect } from 'next/navigation'

const GAMIFICATION_BACKEND = '/backend/gamification'

export default async function BackendIndex() {
  const auth = await getAuthFromCookies()
  if (!auth) {
    redirect('/api/auth/session/refresh?redirect=' + encodeURIComponent(GAMIFICATION_BACKEND))
  }
  redirect(GAMIFICATION_BACKEND)
}
