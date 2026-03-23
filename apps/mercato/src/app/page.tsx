import { Button } from '@/components/ui/button'
import type { Metadata } from 'next'
import { resolveLocalizedAppMetadata } from '@/lib/metadata'
import Image from 'next/image'
import Link from 'next/link'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  return resolveLocalizedAppMetadata()
}

export default async function Home() {
  const { t } = await resolveTranslations()

  return (
    <main className="min-h-svh w-full flex flex-col items-center justify-center gap-8 p-8">
      <Image
        src="/brand/districtlogowhite.svg"
        alt={t('app.page.logoAlt', 'District Gamification Engine')}
        width={280}
        height={70}
        priority
        className="h-14 w-auto brightness-0 dark:invert"
      />
      <h1 className="text-3xl font-semibold tracking-tight text-center">
        {t('app.page.title', 'District Gamification Engine')}
      </h1>
      <Button
        asChild
        className="min-w-[200px] bg-black text-white hover:bg-black/90 dark:bg-black dark:text-white dark:hover:bg-black/90"
      >
        <Link href="/login">{t('app.page.quickLinks.login', 'Login')}</Link>
      </Button>
    </main>
  )
}
