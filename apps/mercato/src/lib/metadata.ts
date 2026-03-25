import type { Metadata } from 'next'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'

export async function resolveLocalizedAppMetadata(): Promise<Metadata> {
  const { t } = await resolveTranslations()
  return {
    title: t('app.metadata.title', 'District Gamification Engine'),
    description: t('app.metadata.description', 'District Gamification Engine'),
  }
}

export async function resolveLocalizedTitleMetadata(input: {
  title?: string | null
  titleKey?: string | null
  fallback?: string
}): Promise<Metadata> {
  const { t } = await resolveTranslations()
  const fallbackTitle = input.title || input.fallback || 'District Gamification Engine'
  return {
    title: input.titleKey ? t(input.titleKey, fallbackTitle) : fallbackTitle,
  }
}
