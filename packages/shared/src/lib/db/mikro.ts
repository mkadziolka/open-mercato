import 'dotenv/config'
import 'reflect-metadata'
import { MikroORM } from '@mikro-orm/core'
import { PostgreSqlDriver } from '@mikro-orm/postgresql'
import { getSslConfig } from './ssl'

type OrmGlobalState = {
  orm: MikroORM<PostgreSqlDriver> | null
  initPromise: Promise<MikroORM<PostgreSqlDriver>> | null
  entities: any[] | null
  shutdownHooksRegistered: boolean
}

const GLOBAL_ORM_KEY = '__openMercatoMikroOrmState__'

function getGlobalOrmState(): OrmGlobalState {
  const globalScope = globalThis as typeof globalThis & {
    [GLOBAL_ORM_KEY]?: OrmGlobalState
  }
  if (!globalScope[GLOBAL_ORM_KEY]) {
    globalScope[GLOBAL_ORM_KEY] = {
      orm: null,
      initPromise: null,
      entities: null,
      shutdownHooksRegistered: false,
    }
  }
  return globalScope[GLOBAL_ORM_KEY]!
}

async function closeOrmIfLoaded(): Promise<void> {
  const state = getGlobalOrmState()
  if (state.orm) {
    await state.orm.close(true)
    state.orm = null
  }
}

function registerShutdownHooks(): void {
  const state = getGlobalOrmState()
  if (state.shutdownHooksRegistered) return
  state.shutdownHooksRegistered = true
  if (typeof process === 'undefined' || typeof process.once !== 'function') return

  const shutdown = () => {
    void closeOrmIfLoaded()
  }

  process.once('beforeExit', shutdown)
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

export function registerOrmEntities(entities: any[]) {
  const state = getGlobalOrmState()
  if (state.entities !== null && process.env.NODE_ENV === 'development') {
    console.debug('[Bootstrap] ORM entities re-registered (this may occur during HMR)')
  }
  state.entities = entities
}

export function getOrmEntities(): any[] {
  const state = getGlobalOrmState()
  if (!state.entities) {
    throw new Error('[Bootstrap] ORM entities not registered. Call registerOrmEntities() at bootstrap.')
  }
  return state.entities
}

export async function getOrm() {
  registerShutdownHooks()
  const state = getGlobalOrmState()
  if (state.orm) {
    return state.orm
  }
  if (state.initPromise) {
    return state.initPromise
  }

  state.initPromise = (async () => {
    const entities = getOrmEntities()
    const clientUrl = process.env.DATABASE_URL
    if (!clientUrl) throw new Error('DATABASE_URL is not set')

    // Parse connection pool settings from environment
    const poolMin = parseInt(process.env.DB_POOL_MIN || '2')
    const poolMax = parseInt(process.env.DB_POOL_MAX || '50')
    const poolIdleTimeout = parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '3000')
    const poolAcquireTimeout = parseInt(process.env.DB_POOL_ACQUIRE_TIMEOUT || '6000')
    const idleSessionTimeoutEnv = parseInt(process.env.DB_IDLE_SESSION_TIMEOUT_MS || '')
    const idleInTxTimeoutEnv = parseInt(process.env.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS || '')
    const idleSessionTimeoutMs = Number.isFinite(idleSessionTimeoutEnv)
      ? idleSessionTimeoutEnv
      : process.env.NODE_ENV === 'production'
        ? undefined
        : 600_000
    const idleInTransactionTimeoutMs = Number.isFinite(idleInTxTimeoutEnv)
      ? idleInTxTimeoutEnv
      : process.env.NODE_ENV === 'production'
        ? undefined
        : 120_000
    const connectionOptions =
      idleSessionTimeoutMs && idleSessionTimeoutMs > 0
        ? `-c idle_session_timeout=${idleSessionTimeoutMs}`
        : undefined

    const sslConfig = getSslConfig()

    const orm = await MikroORM.init<PostgreSqlDriver>({
      driver: PostgreSqlDriver,
      clientUrl,
      entities,
      debug: false,
      // Connection pooling configuration
      pool: {
        min: poolMin,
        max: poolMax,
        idleTimeoutMillis: poolIdleTimeout,
        acquireTimeoutMillis: poolAcquireTimeout,
        // Close connections after 30 seconds
        destroyTimeoutMillis: process.env.NODE_ENV === 'production' ? 30000 : 3000,
      },
      // Connection options
      driverOptions: {
        // Enable connection pooling
        connection: {
          // Maximum number of connections in the pool
          max: poolMax,
          // Minimum number of connections in the pool
          min: poolMin,
          // Close connections after this many milliseconds of inactivity
          idleTimeoutMillis: poolIdleTimeout,
          // Maximum time to wait for a connection from the pool
          acquireTimeoutMillis: poolAcquireTimeout,
          idle_in_transaction_session_timeout: idleInTransactionTimeoutMs,
          options: connectionOptions,
          ssl: sslConfig,
        },
      },
    })

    state.orm = orm
    return orm
  })()

  try {
    return await state.initPromise
  } finally {
    state.initPromise = null
  }
}