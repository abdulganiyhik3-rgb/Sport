import { handleGetBillingPlans } from '@/lib/billing/handlers'

export const dynamic = 'force-dynamic'

export async function GET() {
  return handleGetBillingPlans()
}
