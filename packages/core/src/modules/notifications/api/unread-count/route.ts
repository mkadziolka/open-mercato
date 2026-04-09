import type { EntityManager } from '@mikro-orm/core'
import { Notification } from '../../data/entities'
import { unreadCountResponseSchema } from '../openapi'
import { resolveNotificationContext } from '../../lib/routeHelpers'

export const metadata = {
  GET: { requireAuth: true },
}

export async function GET(req: Request) {
  const { scope, ctx } = await resolveNotificationContext(req)
  try {
    const em = ctx.container.resolve('em') as EntityManager

    const count = await em.count(Notification, {
      recipientUserId: scope.userId,
      tenantId: scope.tenantId,
      status: 'unread',
    })

    return Response.json({ unreadCount: count })
  } finally {
    const disposable = ctx.container as unknown as { dispose?: () => Promise<void> }
    if (typeof disposable.dispose === 'function') {
      await disposable.dispose()
    }
  }
}

export const openApi = {
  GET: {
    summary: 'Get unread notification count',
    tags: ['Notifications'],
    responses: {
      200: {
        description: 'Unread count',
        content: {
          'application/json': {
            schema: unreadCountResponseSchema,
          },
        },
      },
    },
  },
}
