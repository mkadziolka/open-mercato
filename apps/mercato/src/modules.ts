// Central place to enable modules and their source.
// - id: module id (plural snake_case; special cases: 'auth')
// - from: '@open-mercato/core' | '@app' | custom alias/path in future

export type ModuleEntry = { id: string; from?: '@open-mercato/core' | '@app' | string }

export const enabledModules: ModuleEntry[] = [
  { id: 'dashboards', from: '@open-mercato/core' },
  { id: 'auth', from: '@open-mercato/core' },
  { id: 'api_keys', from: '@open-mercato/core' },
  { id: 'audit_logs', from: '@open-mercato/core' },
  { id: 'progress', from: '@open-mercato/core' },
  { id: 'gamification', from: '@app' },
  { id: 'directory', from: '@open-mercato/core' },
  { id: 'entities', from: '@open-mercato/core' },
  { id: 'translations', from: '@open-mercato/core' },
  { id: 'configs', from: '@open-mercato/core' },
  { id: 'attachments', from: '@open-mercato/core' },
  { id: 'messages', from: '@open-mercato/core' },
  { id: 'scheduler', from: '@open-mercato/scheduler' },
  { id: 'example', from: '@app' },
]
