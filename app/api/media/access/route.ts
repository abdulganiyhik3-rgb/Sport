import { handleMediaAccess } from '@/lib/billing/media'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return handleMediaAccess(request)
}

export async function POST(request: Request) {
  return handleMediaAccess(request)
}
