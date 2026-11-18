export type TwitchEmbedMediaKind = 'channel' | 'video' | 'clip'

export interface TwitchEmbedMedia {
  kind: TwitchEmbedMediaKind
  id: string
}

export function isValidTwitchEmbedMedia(
  media: TwitchEmbedMedia,
): boolean {
  if (!media.id || media.id.trim() !== media.id) return false

  if (media.kind === 'channel') {
    return /^[A-Za-z0-9_]{1,64}$/.test(media.id)
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
  const normalizedParent = parent.trim().toLowerCase()
  if (
    !normalizedParent ||
    normalizedParent.includes('://') ||
    normalizedParent.includes('/') ||
    /[\u0000-\u001f\u007f\s]/.test(normalizedParent)
  ) {
    throw new Error('A valid Twitch embed parent domain is required.')
  }
  if (!isValidTwitchEmbedMedia(media)) {
    throw new Error('A valid Twitch channel, VOD, or clip identifier is required.')
  }

  return {
    width: '100%',
    height: '100%',
    layout: chatEnabled ? 'video-with-chat' : 'video',
    autoplay: false,
    muted: false,
    allowfullscreen: true,
    parent: [normalizedParent],
    ...(media.kind === 'channel'
      ? { channel: media.id }
      : media.kind === 'video'
        ? { video: media.id }
        : { clip: media.id }),
  }
}

export function getTwitchPlayerErrorMessage(
  kind: TwitchEmbedMediaKind,
): string {
  if (kind === 'channel') {
    return 'Twitch could not load this channel. It may be offline, restricted, or unavailable for embedding.'
  }
  if (kind === 'video') {
    return 'Twitch could not load this VOD. It may be deleted, restricted, or unavailable for embedding.'
  }
  return 'Twitch could not load this clip. It may be deleted, restricted, or unavailable for embedding.'
}
