import { createClient } from '@/lib/supabase/server'
import {
  fetchInitialCatalog,
  type InitialCatalogData,
} from '@/lib/sportivra/data'
import { SportivraApp } from '@/components/sportivra-app'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const supabase = await createClient()
  const serverDateUtc = new Date().toISOString().slice(0, 10)

  const fallbackForClientHydration: InitialCatalogData = {
    sports: [],
    matches: [],
    highlights: [],
    newsArticles: [],
    user: null,
    profile: null,
    reminderMatchIds: [],
    serverDateUtc,
    serverHydrated: false,
    loadError: null,
  }

  const initialData = await Promise.race([
    fetchInitialCatalog(supabase),
    new Promise<InitialCatalogData>((resolve) =>
      setTimeout(() => resolve(fallbackForClientHydration), 1800),
    ),
  ])

  return <SportivraApp initialData={initialData} />
}
