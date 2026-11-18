# SPORTIVRA

SPORTIVRA is a sports discovery and media experience built with Next.js.

## Local development

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Run the verification suite with:

```bash
corepack pnpm test
corepack pnpm exec tsc --noEmit
corepack pnpm exec next build
```

## Twitch integration

The Twitch section is an optional, server-configured integration. It uses Twitch Helix for discovery and account actions, Twitch OAuth for user-authorized actions, and the official Twitch Embed SDK for playback and chat. SPORTIVRA does not proxy, rehost, scrape, or bypass Twitch media, ads, access controls, or regional restrictions.

### Server environment

Set these values only in the server/deployment environment. Do not expose them as `NEXT_PUBLIC_*` variables, commit a populated `.env` file, or log their values.

- `TWITCH_CLIENT_ID` — required Twitch application client ID.
- `TWITCH_CLIENT_SECRET` — required server-only Twitch application secret.
- `TWITCH_TOKEN_ENCRYPTION_KEY` — required for Twitch OAuth sessions and state; use a high-entropy server-only secret of at least 32 characters. Generate one with `openssl rand -base64 32`.
- `TWITCH_REDIRECT_URI` — optional explicit callback URL. If omitted, the server derives `/api/twitch/oauth/callback` from the trusted application origin used by the existing app configuration. Register the exact resulting HTTPS URL in the Twitch developer console. For local development, use the exact local callback URL registered in the Twitch console rather than relying on an unregistered preview origin.

Public discovery requires the client ID and secret. OAuth connection and account actions also require the encryption key and a trusted callback origin (an explicit redirect URI or the existing trusted app-origin configuration). The Twitch config endpoint reports readiness without returning secrets.

### Twitch application setup

1. Create or use an application in the Twitch developer console.
2. Register the exact callback URL as `TWITCH_REDIRECT_URI`, or confirm the derived production URL when using the existing trusted app-origin configuration.
3. Add the server variables above to the deployment environment and restart the server.
4. Keep the default least-privilege OAuth request for follows. The UI requests additional official capabilities only when the user explicitly starts the relevant flow: `clips:edit` for creating clips and `channel:read:subscriptions` for broadcaster subscription status.
5. Verify the integration with the test suite and a Twitch account that is permitted to use the requested capability.

### Vercel checklist

In **Vercel → Project → Settings → Environment Variables**, add the four Twitch variables to the **Production** environment:

```text
TWITCH_CLIENT_ID
TWITCH_CLIENT_SECRET
TWITCH_TOKEN_ENCRYPTION_KEY
TWITCH_REDIRECT_URI=https://your-production-domain.example/api/twitch/oauth/callback
```

Use the exact production URL registered in the Twitch developer console. Do not add `NEXT_PUBLIC_` to any of these names. Preview deployments should not reuse a production callback URL unless that URL is the domain users will use for OAuth; register a separate exact preview callback only when preview OAuth is needed. Redeploy after changing Vercel environment variables.

### Implemented endpoints and behavior

- `/api/twitch/discover` — streams, channels, categories, VODs, clips, and schedules through Helix, including pagination and safe error handling.
- `/api/twitch/oauth/start`, `/api/twitch/oauth/callback`, `/api/twitch/oauth/disconnect`, `/api/twitch/me` — OAuth authorization-code flow, encrypted HttpOnly session cookies, validation/refresh, and disconnect.
- `/api/twitch/follow`, `/api/twitch/followed`, `/api/twitch/notifications` — authenticated follows and followed-channel live polling.
- `/api/twitch/subscriptions` — broadcaster-only subscription status where the account has the official scope and relationship required by Twitch.
- `/api/twitch/clips` — broadcaster-authorized clip creation, subject to Twitch's live-channel and permission rules.

OAuth state, access tokens, and refresh tokens remain server-side in encrypted HttpOnly cookies. Mutation routes require same-origin requests and do not return token material. Signed-out users can still use public discovery and official embeds; account features degrade to a connect prompt or an explanatory limitation.

### Limitations to expect

Twitch controls whether a stream, VOD, or clip is playable. Availability can vary by region, channel, age/content restrictions, account status, channel settings, rights, ads, and Twitch's own mobile or embed rules. The Embed SDK controls playback behavior exposed by Twitch; SPORTIVRA cannot guarantee a specific bitrate, quality menu, ad experience, latency, fullscreen mode, chat availability, or mobile behavior. Twitch may require the correct `parent` domain and can change embed restrictions.

Helix is rate-limited. The server surfaces safe rate-limit errors and does not leak credentials. Search, schedules, follows, subscription status, notifications, and clip creation depend on the endpoint's documented scopes and account/broadcaster permissions. Browser live alerts are opt-in notifications while SPORTIVRA is open; they are not a background push service.

If the server reports that Twitch is not configured, public discovery is intentionally disabled until the server variables are supplied. No Twitch secrets or populated environment files are included in this repository.
