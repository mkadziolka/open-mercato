/**
 * Regression guard: every worker file under an enabled module that exports
 * `metadata` MUST appear in `.mercato/generated/modules.generated.ts`.
 *
 * Background: the CLI registry generator loads each worker via a bare
 * `import()` (see `moduleHasExport` in `@open-mercato/cli/lib/utils`). If the
 * worker's top-level code pulls in an extensionless `.ts` sibling, Node's ESM
 * loader — which runs without `tsx` during generation — throws
 * "Cannot find module …". `moduleHasExport` swallows that in a `catch` and
 * returns `false`, so the worker is SILENTLY dropped from the generated
 * registry. `mercato queue worker --all` then never subscribes to that
 * queue and jobs pile up forever (we hit this with `gamification-event-process`
 * importing `../lib/per-user-mutex`).
 *
 * This test parses each worker's source text (not its runtime module) and
 * checks the generated registry for the corresponding `Worker<N>_<modId>_<name>`
 * identifier emitted by `processWorkers()`. When it fails, the error message
 * points at the likely cause so future regressions are easy to debug.
 */

import fs from 'node:fs'
import path from 'node:path'
import { createResolver } from '@open-mercato/cli/lib/resolver'
import { toVar } from '@open-mercato/cli/lib/utils'

type WorkerCandidate = {
  modId: string
  absPath: string
  /** Path relative to the module's `workers/` folder (without `.ts`). */
  relName: string
  /** Stable identifier suffix emitted by the generator. */
  idSuffix: string
}

const METADATA_RE = /^\s*export\s+const\s+metadata\b/m
const TEST_FILE_RE = /\.(test|spec)\.ts$/
const TS_FILE_RE = /\.ts$/

/**
 * Workers that are known to be silently dropped from `modules.generated.ts`
 * because their top-level code imports extensionless `.ts` siblings (the exact
 * regression this test was written to catch). They belong to unrelated
 * packages; fixing them requires moving those runtime imports to dynamic
 * `import()` calls inside the handler, which is out of scope for the gamification
 * work that introduced this guard. Track the fix per entry and remove from
 * this list once the worker is rewritten and verified by rerunning this test.
 *
 * Rules for this allow-list:
 * 1) New entries require a linked TODO explaining the underlying cause.
 * 2) An allow-listed worker MUST still be detected as a candidate (i.e. still
 *    has `export const metadata` on disk); if it disappears from disk the
 *    allow-list becomes stale and the test will flag it.
 * 3) Before merging a new feature/module, prefer fixing over allow-listing.
 */
const KNOWN_UNREGISTERED_WORKERS: ReadonlyArray<{
  modId: string
  /** `relName` as produced by `collectWorkersForDir` — workers/ path without `.ts`. */
  relName: string
  reason: string
}> = [
  {
    modId: 'messages',
    relName: 'send-email.worker',
    reason:
      'TODO(open-mercato/core#messages): top-level runtime imports of `../../auth/data/entities`, `../data/entities`, `../events`, `../lib/*` break `moduleHasExport` under plain Node loader. Convert to lazy `import()` inside the handler.',
  },
]

function isKnownUnregistered(modId: string, relName: string): boolean {
  return KNOWN_UNREGISTERED_WORKERS.some(
    (entry) => entry.modId === modId && entry.relName === relName,
  )
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const out: string[] = []
  const stack = [dir]
  while (stack.length) {
    const d = stack.pop()!
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (entry.isFile()) out.push(full)
    }
  }
  return out
}

function fileHasMetadataExport(absPath: string): boolean {
  try {
    const content = fs.readFileSync(absPath, 'utf8')
    return METADATA_RE.test(content)
  } catch {
    return false
  }
}

function collectWorkersForDir(
  modId: string,
  workersRoot: string,
): WorkerCandidate[] {
  const out: WorkerCandidate[] = []
  for (const abs of walk(workersRoot)) {
    const base = path.basename(abs)
    if (!TS_FILE_RE.test(base) || TEST_FILE_RE.test(base)) continue
    if (!fileHasMetadataExport(abs)) continue
    const rel = path.relative(workersRoot, abs).replace(/\\/g, '/')
    const relName = rel.replace(/\.ts$/, '')
    // Mirror generator: `[...segs, name].join('_')` then `toVar()`.
    const segsJoined = relName.split('/').join('_') || 'index'
    const idSuffix = `${toVar(modId)}_${toVar(segsJoined)}`
    out.push({ modId, absPath: abs, relName, idSuffix })
  }
  return out
}

function dedupeByIdSuffix(items: WorkerCandidate[]): WorkerCandidate[] {
  // The generator deduplicates files by `relPath` across app/pkg overrides
  // (app wins). For this assertion we only care that at least one source file
  // per (modId, relName) is registered, so keep the first occurrence.
  const seen = new Set<string>()
  const out: WorkerCandidate[] = []
  for (const item of items) {
    if (seen.has(item.idSuffix)) continue
    seen.add(item.idSuffix)
    out.push(item)
  }
  return out
}

describe('generated module registry: workers with metadata', () => {
  const resolver = createResolver(path.resolve(__dirname, '..', '..'))
  const registryPath = path.join(resolver.getOutputDir(), 'modules.generated.ts')
  const enabledModules = resolver.loadEnabledModules()

  const registryExists = fs.existsSync(registryPath)
  const registryContent = registryExists
    ? fs.readFileSync(registryPath, 'utf8')
    : ''

  const allCandidates = dedupeByIdSuffix(
    enabledModules.flatMap((entry) => {
      const { appBase, pkgBase } = resolver.getModulePaths(entry)
      return [
        ...collectWorkersForDir(entry.id, path.join(appBase, 'workers')),
        ...collectWorkersForDir(entry.id, path.join(pkgBase, 'workers')),
      ]
    }),
  )
  const candidates = allCandidates.filter(
    (c) => !isKnownUnregistered(c.modId, c.relName),
  )
  const knownFailing = allCandidates.filter((c) =>
    isKnownUnregistered(c.modId, c.relName),
  )

  it('has a freshly generated modules.generated.ts to validate against', () => {
    if (!registryExists) {
      throw new Error(
        `Expected generated registry at ${registryPath}. ` +
          `Run \`yarn workspace @open-mercato/app exec mercato generate all\` before running tests.`,
      )
    }
    expect(registryContent).toContain('AUTO-GENERATED')
  })

  if (!registryExists) {
    it.skip('every worker with `export const metadata` is imported by the registry', () => undefined)
    return
  }

  // Parametrised: one assertion per worker so failures name the offending file.
  it.each(candidates.map((c) => [c.modId, c.relName, c] as const))(
    'registers worker %s/%s',
    (_modId, _relName, candidate) => {
      const identifierRe = new RegExp(
        `\\bWorker\\d+_${candidate.idSuffix}\\b`,
      )
      if (!identifierRe.test(registryContent)) {
        throw new Error(
          `Worker ${candidate.absPath} has \`export const metadata\` but is ` +
            `missing from ${registryPath} ` +
            `(expected identifier matching /Worker\\d+_${candidate.idSuffix}/).\n\n` +
            `The generator silently drops workers when \`moduleHasExport\` throws ` +
            `while importing the file. The most common cause is a top-level ` +
            `runtime import of an extensionless \`.ts\` sibling (Node's ESM ` +
            `loader can't resolve it without \`tsx\`). Fix by making such ` +
            `imports lazy (dynamic \`import()\` inside the handler) or keeping ` +
            `only \`import type …\` at the top of the worker file, then re-run ` +
            `\`yarn workspace @open-mercato/app exec mercato generate all\`.`,
        )
      }
    },
  )

  it('discovers at least one worker across enabled modules (sanity check)', () => {
    // Guards against the test becoming a no-op if path resolution breaks.
    expect(candidates.length).toBeGreaterThan(0)
  })

  // Stale-allow-list guard: if someone fixes one of the known-failing workers
  // (or removes it entirely), these assertions remind us to drop the
  // corresponding `KNOWN_UNREGISTERED_WORKERS` entry so the main assertion
  // starts enforcing it again.
  describe('known-unregistered workers allow-list is still accurate', () => {
    if (KNOWN_UNREGISTERED_WORKERS.length === 0) {
      it.skip('no known-unregistered workers declared', () => undefined)
      return
    }

    it.each(
      KNOWN_UNREGISTERED_WORKERS.map(
        (entry) => [entry.modId, entry.relName, entry] as const,
      ),
    )(
      'still needs allow-list entry for %s/%s',
      (modId, relName, entry) => {
        const found = knownFailing.find(
          (c) => c.modId === modId && c.relName === relName,
        )
        if (!found) {
          throw new Error(
            `Allow-list entry for ${modId}/${relName} no longer matches any ` +
              `worker file on disk. Remove it from KNOWN_UNREGISTERED_WORKERS ` +
              `in ${__filename}.\nReason recorded: ${entry.reason}`,
          )
        }
        const identifierRe = new RegExp(`\\bWorker\\d+_${found.idSuffix}\\b`)
        if (identifierRe.test(registryContent)) {
          throw new Error(
            `Worker ${found.absPath} is now registered in ${registryPath}. ` +
              `Remove the allow-list entry for ${modId}/${relName} from ` +
              `KNOWN_UNREGISTERED_WORKERS in ${__filename} so this regression ` +
              `is enforced going forward.\nReason previously recorded: ${entry.reason}`,
          )
        }
      },
    )
  })
})
