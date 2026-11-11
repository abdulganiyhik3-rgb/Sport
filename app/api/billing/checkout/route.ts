import { handlePostCheckout } from '@/lib/billing/handlers'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return handlePostCheckout(request)
}
