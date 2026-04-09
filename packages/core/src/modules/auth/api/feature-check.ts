import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'

type FeatureCheckPayload = {
  ok: boolean
  granted: string[]
  userId: string
}

const featureCheckInflight = new Map<string, Promise<FeatureCheckPayload>>()

export const metadata = {
  POST: { requireAuth: true },
}

export async function POST(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  let body: any = {}
  try { body = await req.json() } catch {}
  const features: string[] = Array.isArray(body?.features) ? body.features : []
  if (!features.length) return NextResponse.json({ ok: true, granted: [], userId: auth.sub })
  const normalizedFeatures = Array.from(new Set(features.filter((feature): feature is string => typeof feature === 'string' && feature.length > 0))).sort()
  if (!normalizedFeatures.length) return NextResponse.json({ ok: true, granted: [], userId: auth.sub })
  const cacheKey = JSON.stringify([
    auth.sub,
    auth.tenantId ?? null,
    auth.orgId ?? null,
    normalizedFeatures,
  ])
  const inflight = featureCheckInflight.get(cacheKey)
  if (inflight) {
    return NextResponse.json(await inflight)
  }
  let container: Awaited<ReturnType<typeof createRequestContainer>> | null = null
  const compute = (async (): Promise<FeatureCheckPayload> => {
    container = await createRequestContainer()
    const rbac = container.resolve<RbacService>('rbacService')
    const acl = await rbac.loadAcl(auth.sub, { tenantId: auth.tenantId, organizationId: auth.orgId })
    const hasOrganizationAccess =
      !(acl.organizations && auth.orgId && !acl.organizations.includes(auth.orgId))
    const granted = acl.isSuperAdmin || hasOrganizationAccess
      ? normalizedFeatures.filter((feature) => acl.isSuperAdmin || rbac.hasAllFeatures([feature], acl.features))
      : []
    const ok = granted.length === normalizedFeatures.length
    return { ok, granted, userId: auth.sub }
  })()
  featureCheckInflight.set(cacheKey, compute)
  try {
    return NextResponse.json(await compute)
  } finally {
    featureCheckInflight.delete(cacheKey)
    const disposable = container as unknown as { dispose?: () => Promise<void> } | null
    if (typeof disposable?.dispose === 'function') {
      await disposable.dispose()
    }
  }
}

const featureCheckRequestSchema = z.object({
  features: z.array(z.string()).describe('Feature identifiers to check'),
}).describe('Batch feature check payload')

const featureCheckResponseSchema = z.object({
  ok: z.boolean().describe('Indicates whether all requested features are granted'),
  granted: z.array(z.string()).describe('Features the current user may access'),
  userId: z.string().describe('Identifier of the authenticated user'),
})

const featureCheckMethodDoc: OpenApiMethodDoc = {
  summary: 'Check feature grants for the current user',
  description: 'Evaluates which of the requested features are available to the signed-in user within the active tenant / organization context.',
  tags: ['Authentication & Accounts'],
  requestBody: {
    contentType: 'application/json',
    schema: featureCheckRequestSchema,
    description: 'Feature identifiers to evaluate.',
  },
  responses: [
    {
      status: 200,
      description: 'Evaluation result',
      schema: featureCheckResponseSchema,
    },
  ],
  errors: [
    {
      status: 401,
      description: 'Authentication required',
      schema: z.object({ ok: z.literal(false), error: z.string() }),
    },
  ],
}

export const openApi: OpenApiRouteDoc = {
  summary: 'Check feature grants for the current user',
  methods: {
    POST: featureCheckMethodDoc,
  },
}
