import { handleCreateManageLink } from '@/lib/billing/handlers'

export const dynamic = 'force-dynamic'

export async function POST() {
  return handleCreateManageLink()
}
