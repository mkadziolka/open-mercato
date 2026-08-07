import type { BootstrapData } from './types'
import { findAppRoot, type AppRoot } from './appResolver'
import { registerEntityIds } from '../encryption/entityIds'
import path from 'node:path'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

/**
 * Compile a TypeScript file to JavaScript using esbuild bundler.
 * This bundles the file and all its dependencies, handling JSON imports properly.
 * The compiled file is written next to the source file with a .mjs extension.
 */
async function compileAndImport(tsPath: string): Promise<Record<string, unknown>> {
  const jsPath = tsPath.replace(/\.ts$/, '.mjs')

  // Check if we need to recompile (source newer than compiled)
  const tsExists = fs.existsSync(tsPath)
  const jsExists = fs.existsSync(jsPath)

  if (!tsExists) {
    throw new Error(`Generated file not found: ${tsPath}`)
  }

  // In development/CLI workflows, generated entry files often stay unchanged while
  // their imported module sources under src/modules/ evolve. Reusing the cached
  // bundled .mjs would then serve stale DI registrations, workers, or subscribers.
  // Rebuild eagerly outside production so runtime code matches current source.
  const forceRecompile = process.env.NODE_ENV !== 'production'
  const needsCompile = forceRecompile ||
    !jsExists ||
    fs.statSync(tsPath).mtimeMs > fs.statSync(jsPath).mtimeMs

  if (needsCompile) {
    // Dynamically import esbuild only when needed
    const esbuild = await import('esbuild')

    // The app root is 2 levels up from .mercato/generated/
    const appRoot = path.dirname(path.dirname(path.dirname(tsPath)))

    // Plugin to resolve @/ alias to app root (works for @app modules)
    const aliasPlugin: import('esbuild').Plugin = {
      name: 'alias-resolver',
      setup(build) {
        // Resolve @/ alias to app root
        build.onResolve({ filter: /^@\// }, (args) => {
          const resolved = path.join(appRoot, args.path.slice(2))
          // Try with .ts extension if base path doesn't exist
          if (!fs.existsSync(resolved) && fs.existsSync(resolved + '.ts')) {
            return { path: resolved + '.ts' }
          }
          // Also check for /index.ts if it's a directory
          if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory() && fs.existsSync(path.join(resolved, 'index.ts'))) {
            return { path: path.join(resolved, 'index.ts') }
          }
          return { path: resolved }
        })
      },
    }

    // Plugin to mark non-JSON package imports as external
    const externalNonJsonPlugin: import('esbuild').Plugin = {
      name: 'external-non-json',
      setup(build) {
        // Mark all package imports as external EXCEPT JSON files
        // Filter matches paths that don't start with . or / (package imports like @open-mercato/shared)
        build.onResolve({ filter: /^[^./]/ }, (args) => {
          // Skip Windows absolute paths (e.g., C:\...) - they're local files, not packages
          if (/^[a-zA-Z]:/.test(args.path)) {
            return null // Let esbuild handle it
          }
          // If it's a JSON file, let esbuild bundle it
          if (args.path.endsWith('.json')) {
            return null // Let esbuild handle it
          }
          // Otherwise mark as external
          return { path: args.path, external: true }
        })
      },
    }

    // Write to a temp file then rename so concurrent CLI processes
    // (server + workers + scheduler) never import a half-written .mjs.
    const tmpPath = `${jsPath}.${process.pid}.${Date.now()}.tmp.mjs`
    try {
      await esbuild.build({
        entryPoints: [tsPath],
        outfile: tmpPath,
        bundle: true,
        format: 'esm',
        platform: 'node',
        target: 'node18',
        plugins: [aliasPlugin, externalNonJsonPlugin],
        // Allow JSON imports
        loader: { '.json': 'json' },
      })
      fs.renameSync(tmpPath, jsPath)
    } catch (err) {
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
      } catch {
        // ignore cleanup errors
      }
      throw err
    }
  }

  // Import the compiled JavaScript (cache-bust so a freshly renamed file is loaded)
  const fileUrl = `${pathToFileURL(jsPath).href}?t=${fs.statSync(jsPath).mtimeMs}`
  return import(fileUrl)
}


/**
 * Dynamically load bootstrap data from a resolved app directory.
 *
 * IMPORTANT: This only works in unbundled contexts (CLI, tsx).
 * Do NOT use this in Next.js bundled code - use static imports instead.
 *
 * For CLI context, we skip loading modules.generated.ts which has Next.js dependencies.
 * CLI commands are discovered separately via the CLI module system.
 *
 * @param appRoot - Optional explicit app root path. If not provided, will search from cwd.
 * @returns The loaded bootstrap data
 * @throws Error if app root cannot be found or generated files are missing
 */
export async function loadBootstrapData(appRoot?: string): Promise<BootstrapData> {
  const resolved: AppRoot | null = appRoot
    ? {
        generatedDir: path.join(appRoot, '.mercato', 'generated'),
        appDir: appRoot,
        mercatoDir: path.join(appRoot, '.mercato'),
      }
    : findAppRoot()

  if (!resolved) {
    throw new Error(
      'Could not find app root with .mercato/generated directory. ' +
        'Make sure you run this command from within a Next.js app directory, ' +
        'or run "yarn mercato generate" first to create the generated files.',
    )
  }

  const { generatedDir } = resolved

  // IMPORTANT: Load entity IDs FIRST and register them before loading modules.
  // This is because modules (e.g., ce.ts files) use E.xxx.xxx at module scope,
  // and they need entity IDs to be available when they're imported.
  const entityIdsModule = await compileAndImport(path.join(generatedDir, 'entities.ids.generated.ts'))
  registerEntityIds(entityIdsModule.E as BootstrapData['entityIds'])

  // Now load the rest of the generated files.
  // modules.cli.generated.ts excludes Next.js-dependent code (routes, APIs, widgets)
  const [
    modulesModule,
    entitiesModule,
    diModule,
    searchModule,
  ] = await Promise.all([
    compileAndImport(path.join(generatedDir, 'modules.cli.generated.ts')),
    compileAndImport(path.join(generatedDir, 'entities.generated.ts')),
    compileAndImport(path.join(generatedDir, 'di.generated.ts')),
    compileAndImport(path.join(generatedDir, 'search.generated.ts')).catch(() => ({ searchModuleConfigs: [] })),
  ])

  const modules = (modulesModule.modules ?? modulesModule.default) as BootstrapData['modules']
  if (!Array.isArray(modules)) {
    throw new Error(
      `Failed to load modules from modules.cli.generated: expected an array, got ${typeof modules}. ` +
        'Try deleting .mercato/generated/*.mjs and re-running yarn generate.',
    )
  }

  return {
    modules,
    entities: (entitiesModule.entities ?? entitiesModule.default) as BootstrapData['entities'],
    diRegistrars: (diModule.diRegistrars ?? diModule.default) as BootstrapData['diRegistrars'],
    entityIds: (entityIdsModule.E ?? entityIdsModule.default) as BootstrapData['entityIds'],
    // Search configs are needed by workers for indexing
    searchModuleConfigs: (searchModule.searchModuleConfigs ?? []) as BootstrapData['searchModuleConfigs'],
    // Empty UI-related data - not needed for CLI
    dashboardWidgetEntries: [],
    injectionWidgetEntries: [],
    injectionTables: [],
    interceptorEntries: [],
    componentOverrideEntries: [],
  }
}

/**
 * Create and execute bootstrap in CLI context.
 *
 * This is a convenience function that finds the app root, loads the generated
 * data dynamically, and runs bootstrap. Use this in CLI entry points.
 *
 * Returns the loaded bootstrap data so the CLI can register modules directly
 * (avoids module resolution issues when importing @open-mercato/cli/mercato).
 *
 * @param appRoot - Optional explicit app root path
 * @returns The loaded bootstrap data (modules, entities, etc.)
 */
export async function bootstrapFromAppRoot(appRoot?: string): Promise<BootstrapData> {
  const { createBootstrap, waitForAsyncRegistration } = await import('./factory.js')
  const data = await loadBootstrapData(appRoot)
  const bootstrap = createBootstrap(data)
  bootstrap()
  // In CLI context, wait for async registrations (UI widgets, search configs, etc.)
  await waitForAsyncRegistration()

  return data
}
