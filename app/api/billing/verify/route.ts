import { handleVerifyCheckout } from '@/lib/billing/handlers'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return handleVerifyCheckout(request)
}

export async function POST(request: Request) {
  return handleVerifyCheckout(request)
}
