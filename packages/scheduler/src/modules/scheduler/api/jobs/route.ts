import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/core'
import { NextResponse } from 'next/server'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { resolveCrudRecordId } from '@open-mercato/shared/lib/api/scoped'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { AuthContext } from '@open-mercato/shared/lib/auth/server'
import { ScheduledJob } from '../../data/entities.js'
import {
  scheduleCreateSchema,
  scheduleUpdateSchema,
  scheduleDeleteSchema,
  scheduleListQuerySchema,
} from '../../data/validators.js'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import {
  createSchedulerCrudOpenApi,
  createPagedListResponseSchema,
  defaultOkResponseSchema,
} from '../openapi.js'

const rawBodySchema = z.object({}).passthrough()

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['scheduler.jobs.view'] },
  POST: { requireAuth: true, requireFeatures: ['scheduler.jobs.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['scheduler.jobs.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['scheduler.jobs.manage'] },
}

export const metadata = routeMetadata

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: ScheduledJob,
    idField: 'id',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    entityId: 'scheduler:scheduled_job',
    schema: scheduleListQuerySchema,
    fields: [
      'id',
      'name',
      'description',
      'scope_type',
      'organization_id',
      'tenant_id',
      'schedule_type',
      'schedule_value',
      'timezone',
      'target_type',
      'target_queue',
      'target_command',
      'target_payload',
      'require_feature',
      'is_enabled',
      'last_run_at',
      'next_run_at',
      'source_type',
      'source_module',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: {
      name: 'name',
      nextRunAt: 'next_run_at',
      lastRunAt: 'last_run_at',
      createdAt: 'created_at',
    },
    transformItem: (item: Record<string, unknown>) => {
      if (!item) return item
      return {
        id: item.id,
        name: item.name,
        description: item.description,
        scopeType: item.scope_type,
        organizationId: item.organization_id,
        tenantId: item.tenant_id,
        scheduleType: item.schedule_type,
        scheduleValue: item.schedule_value,
        timezone: item.timezone,
        targetType: item.target_type,
        targetQueue: item.target_queue,
        targetCommand: item.target_command,
        targetPayload: item.target_payload,
        requireFeature: item.require_feature,
        isEnabled: item.is_enabled,
        lastRunAt: item.last_run_at,
        nextRunAt: item.next_run_at,
        sourceType: item.source_type,
        sourceModule: item.source_module,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      }
    },
    // GET is implemented by a custom handler below (see `export async function GET`).
    // This buildFilters is retained only because the CRUD factory expects
    // a list config when entityId is present; the custom handler bypasses it.
    buildFilters: async () => ({}),
  },
  actions: {
    create: {
      commandId: 'scheduler.jobs.create',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        // Auto-populate organizationId and tenantId based on scopeType
        const scopeType = raw.scopeType
        let organizationId = raw.organizationId
        let tenantId = raw.tenantId
        
        if (scopeType === 'system') {
          // System scope requires superadmin privileges
          const isSuperAdmin = Array.isArray(ctx.auth?.roles) && ctx.auth.roles.some(
            (role: unknown) => typeof role === 'string' && role.trim().toLowerCase() === 'superadmin'
          )
          if (!isSuperAdmin) {
            throw new CrudHttpError(403, { error: 'System-scoped schedules require superadmin privileges' })
          }
          // System scope: no org/tenant
          organizationId = null
          tenantId = null
        } else if (scopeType === 'organization') {
          // Organization scope: use auth context (orgId and tenantId)
          organizationId = ctx.auth?.orgId ?? null
          tenantId = ctx.auth?.tenantId ?? null
        } else if (scopeType === 'tenant') {
          // Tenant scope: use auth context tenantId only
          organizationId = null
          tenantId = ctx.auth?.tenantId ?? null
        }
        
        const parsed = scheduleCreateSchema.parse({
          ...raw,
          organizationId,
          tenantId,
        })
        return parsed
      },
      response: ({ result }) => ({
        id: result?.id ?? null,
      }),
      status: 201,
    },
    update: {
      commandId: 'scheduler.jobs.update',
      schema: rawBodySchema,
      mapInput: async ({ raw }) => {
        const parsed = scheduleUpdateSchema.parse(raw)
        return parsed
      },
      response: () => ({ ok: true }),
    },
    delete: {
      commandId: 'scheduler.jobs.delete',
      schema: rawBodySchema,
      mapInput: async ({ parsed, ctx }) => {
        const { translate } = await resolveTranslations()
        const id = resolveCrudRecordId(parsed, ctx, translate)
        if (!id) {
          throw new CrudHttpError(400, { 
            error: translate('scheduler.errors.id_required', 'Schedule id is required') 
          })
        }
        return { id }
      },
      response: () => ({ ok: true }),
    },
  },
})

const { POST, PUT, DELETE } = crud
export { POST, PUT, DELETE }

function toIso(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }
  return null
}

function serializeScheduledJob(schedule: ScheduledJob): Record<string, unknown> {
  return {
    id: schedule.id,
    name: schedule.name,
    description: schedule.description ?? null,
    scopeType: schedule.scopeType,
    organizationId: schedule.organizationId ?? null,
    tenantId: schedule.tenantId ?? null,
    scheduleType: schedule.scheduleType,
    scheduleValue: schedule.scheduleValue,
    timezone: schedule.timezone,
    targetType: schedule.targetType,
    targetQueue: schedule.targetQueue ?? null,
    targetCommand: schedule.targetCommand ?? null,
    targetPayload: schedule.targetPayload ?? null,
    requireFeature: schedule.requireFeature ?? null,
    isEnabled: schedule.isEnabled,
    lastRunAt: toIso(schedule.lastRunAt ?? null),
    nextRunAt: toIso(schedule.nextRunAt ?? null),
    sourceType: schedule.sourceType,
    sourceModule: schedule.sourceModule ?? null,
    createdAt: toIso(schedule.createdAt) ?? '',
    updatedAt: toIso(schedule.updatedAt) ?? '',
  }
}

/**
 * Custom GET handler
 *
 * The default CRUD list path enforces a strict `tenant_id = auth.tenantId` guard
 * through QueryEngine/ORM scoping, which would hide:
 * - system-scope rows (tenant_id IS NULL), and
 * - tenant/organization rows whose visibility depends on scope_type.
 *
 * This handler queries ScheduledJob directly and applies scope-aware visibility:
 * - `system` rows: visible to every authenticated user allowed to view jobs
 * - `tenant` rows: visible to members of the same tenant
 * - `organization` rows: visible to members of the same organization
 *
 * Auth & feature enforcement are performed by the framework via `metadata.GET`.
 */
export async function GET(req: Request, ctx: { params: Record<string, unknown>; auth: AuthContext }) {
  const url = new URL(req.url)
  const searchParams = Object.fromEntries(url.searchParams.entries())
  const parsedQuery = scheduleListQuerySchema.safeParse(searchParams)
  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', issues: parsedQuery.error.issues },
      { status: 400 },
    )
  }
  const query = parsedQuery.data

  const container = await createRequestContainer()
  try {
    const em = (container.resolve('em') as EntityManager).fork()

    const authTenantId = ctx.auth?.tenantId ?? null
    const authOrgId = ctx.auth?.orgId ?? null

    const visibilityOr: Array<Record<string, unknown>> = [{ scopeType: 'system' }]
    if (authTenantId) {
      visibilityOr.push({ scopeType: 'tenant', tenantId: authTenantId })
    }
    if (authOrgId) {
      visibilityOr.push({ scopeType: 'organization', organizationId: authOrgId })
    }

    const where: Record<string, unknown> = {
      deletedAt: null,
      $or: visibilityOr,
    }

    if (query.id) where.id = query.id
    if (query.scopeType) where.scopeType = query.scopeType
    if (query.isEnabled !== undefined) where.isEnabled = query.isEnabled
    if (query.sourceType) where.sourceType = query.sourceType
    if (query.sourceModule) where.sourceModule = query.sourceModule
    if (query.search) {
      const pattern = `%${escapeLikePattern(query.search)}%`
      where.$and = [
        { $or: [{ name: { $ilike: pattern } }, { description: { $ilike: pattern } }] },
      ]
    }

    const sortField = query.sort === 'name' || query.sort === 'nextRunAt' || query.sort === 'lastRunAt' || query.sort === 'createdAt'
      ? query.sort
      : 'createdAt'
    const sortDir = query.order === 'asc' ? 'ASC' : 'DESC'

    const [items, total] = await em.findAndCount(ScheduledJob, where as any, {
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
      orderBy: { [sortField]: sortDir } as any,
    })

    const totalPages = Math.max(1, Math.ceil(total / query.pageSize))

    return NextResponse.json({
      items: items.map(serializeScheduledJob),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages,
    })
  } finally {
    const disposable = container as unknown as { dispose?: () => Promise<void> }
    if (typeof disposable.dispose === 'function') {
      try { await disposable.dispose() } catch { /* noop */ }
    }
  }
}

// Response schemas
const scheduledJobListItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  scopeType: z.enum(['system', 'organization', 'tenant']),
  organizationId: z.string().uuid().nullable(),
  tenantId: z.string().uuid().nullable(),
  scheduleType: z.enum(['cron', 'interval']),
  scheduleValue: z.string(),
  timezone: z.string(),
  targetType: z.enum(['queue', 'command']),
  targetQueue: z.string().nullable(),
  targetCommand: z.string().nullable(),
  targetPayload: z.record(z.string(), z.unknown()).nullable(),
  requireFeature: z.string().nullable(),
  isEnabled: z.boolean(),
  lastRunAt: z.string().nullable(),
  nextRunAt: z.string().nullable(),
  sourceType: z.enum(['user', 'module']),
  sourceModule: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

// OpenAPI specification
export const openApi = createSchedulerCrudOpenApi({
  resourceName: 'ScheduledJob',
  pluralName: 'ScheduledJobs',
  querySchema: scheduleListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(scheduledJobListItemSchema),
  create: {
    schema: scheduleCreateSchema,
    description: 'Creates a new scheduled job with cron or interval-based scheduling.',
  },
  update: {
    schema: scheduleUpdateSchema,
    responseSchema: defaultOkResponseSchema,
    description: 'Updates an existing scheduled job by ID.',
  },
  del: {
    schema: scheduleDeleteSchema,
    responseSchema: defaultOkResponseSchema,
    description: 'Deletes a scheduled job by ID.',
  },
})
