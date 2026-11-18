import { NextResponse } from 'next/server'
import { isTwitchConfigured, isTwitchOAuthConfigured } from '@/lib/twitch/config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  return NextResponse.json(
    {
      configured: isTwitchConfigured(),
      oauthConfigured: isTwitchOAuthConfigured(request.url),
      embedScriptUrl: 'https://player.twitch.tv/js/embed/v1.js',
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
