import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getPublicProfileCacheTtlSeconds } from './modules/gamification/lib/public-profile/tier'

// Note: Do NOT import bootstrap here - proxy historically ran on Edge and
// still must stay free of MikroORM / full app bootstrap. Cache TTL only reads
// process.env. Bootstrap remains in layout.tsx (Node runtime).

export function proxy(req: NextRequest) {
  const requestHeaders = new Headers(req.headers)
  // Expose current URL path (no query) to server components via request headers
  requestHeaders.set('x-next-url', req.nextUrl.pathname)

  const res = NextResponse.next({ request: { headers: requestHeaders } })

  // SPEC-045 — RSC pages cannot set Cache-Control after streaming starts;
  // attach the same public TTL used by the JSON profile endpoint here.
  if (req.nextUrl.pathname.startsWith('/profiles/')) {
    const ttl = getPublicProfileCacheTtlSeconds()
    if (ttl > 0) {
      res.headers.set('Cache-Control', `public, max-age=${ttl}`)
    }
  }

  return res
}

export const config = {
  matcher: ['/backend/:path*', '/profiles/:path*'],
}
