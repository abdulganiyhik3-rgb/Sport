export type TwitchEmbedMediaKind = 'channel' | 'video' | 'clip'

export type TwitchEmbedMedia =
  | { readonly kind: 'channel'; readonly id: string }
  | { readonly kind: 'video'; readonly id: string }
  | { readonly kind: 'clip'; readonly id: string }

export type TwitchPlayerErrorReason =
  | 'offline'
  | 'player-error'
  | 'timeout'
  | 'clip-error'

function normalizeParent(parent: string): string {
  const normalizedParent = parent.trim().toLowerCase()
  const labels = normalizedParent.split('.')
  const isValidHostname =
    normalizedParent.length <= 253 &&
    labels.every(
      (label) =>
        label.length > 0 &&
        label.length <= 63 &&
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    )

  if (!normalizedParent || !isValidHostname) {
    throw new Error('A valid Twitch embed parent domain is required.')
  }

  return normalizedParent
}

export function isValidTwitchEmbedMedia(media: TwitchEmbedMedia): boolean {
  if (!media.id || media.id.trim() !== media.id) return false

  if (media.kind === 'channel') {
    return /^[A-Za-z0-9_]{1,25}$/.test(media.id)
  }

  if (media.kind === 'video') {
    return /^\d{1,30}$/.test(media.id)
  }

  return /^[A-Za-z0-9_-]{1,150}$/.test(media.id)
}

export function getTwitchEmbedOptions(
  media: TwitchEmbedMedia,
  parent: string,
  chatEnabled = false,
): Record<string, unknown> {
  const normalizedParent = normalizeParent(parent)
  if (media.kind === 'clip') {
    throw new Error('Twitch clips use the official Clips embed iframe.')
  }
  if (!isValidTwitchEmbedMedia(media)) {
    throw new Error('A valid Twitch channel or VOD identifier is required.')
  }

  return {
    width: '100%',
    height: '100%',
    layout:
      chatEnabled && media.kind === 'channel' ? 'video-with-chat' : 'video',
    autoplay: false,
    muted: false,
    allowfullscreen: true,
    parent: [normalizedParent],
    ...(media.kind === 'channel' ? { channel: media.id } : { video: media.id }),
  }
}

export function getTwitchClipEmbedUrl(
  clipSlug: string,
  parent: string,
): string {
  const media: TwitchEmbedMedia = { kind: 'clip', id: clipSlug }
  if (!isValidTwitchEmbedMedia(media)) {
    throw new Error('A valid Twitch clip identifier is required.')
  }

  const normalizedParent = normalizeParent(parent)
  const params = new URLSearchParams({
    clip: clipSlug,
    parent: normalizedParent,
  })
  return `https://clips.twitch.tv/embed?${params.toString()}`
}

export function getTwitchPlayerErrorMessage(
  kind: TwitchEmbedMediaKind,
  reason: TwitchPlayerErrorReason = 'player-error',
): string {
  if (reason === 'offline' && kind === 'channel') {
    return 'This Twitch channel is currently offline. Twitch will make the official player available again when the channel goes live.'
  }

  if (reason === 'timeout') {
    return `Twitch did not make this ${kind === 'channel' ? 'channel' : kind === 'video' ? 'VOD' : 'clip'} available in the official embed before the request timed out. It may be offline, deleted, restricted, or unavailable for embedding.`
  }

  if (reason === 'clip-error') {
    return 'Twitch did not load this clip in the official embed. It may be deleted, restricted, unavailable, or blocked from embedding by Twitch.'
  }

  if (kind === 'channel') {
    return 'Twitch returned a player error for this channel. It may be offline, restricted, unavailable, or blocked from embedding.'
  }
  if (kind === 'video') {
    return 'Twitch returned a player error for this VOD. It may be deleted, restricted, unavailable, or blocked from embedding.'
  }
  return 'Twitch returned a player error for this clip. It may be deleted, restricted, unavailable, or blocked from embedding.'
}
