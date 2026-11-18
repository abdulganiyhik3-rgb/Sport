import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getTwitchEmbedOptions,
  getTwitchPlayerErrorMessage,
  isValidTwitchEmbedMedia,
} from '@/lib/twitch/player'

describe('Twitch Embed playback contract', () => {
  it('uses the production host as the Twitch parent and maps channel playback correctly', () => {
    const options = getTwitchEmbedOptions(
      { kind: 'channel', id: 'sports_channel' },
      'sport-topaz-eta.vercel.app',
    )

    assert.deepEqual(options, {
      width: '100%',
      height: '100%',
      layout: 'video',
      autoplay: false,
      muted: false,
      allowfullscreen: true,
      parent: ['sport-topaz-eta.vercel.app'],
      channel: 'sports_channel',
    })
  })

  it('maps VOD and clip playback to their official Embed SDK identifiers', () => {
    assert.equal(
      getTwitchEmbedOptions(
        { kind: 'video', id: '123456789' },
        'sport-topaz-eta.vercel.app',
      )['video'],
      '123456789',
    )
    assert.equal(
      getTwitchEmbedOptions(
        { kind: 'clip', id: 'EncouragingClipSlug' },
        'sport-topaz-eta.vercel.app',
        true,
      )['clip'],
      'EncouragingClipSlug',
    )
    assert.equal(
      getTwitchEmbedOptions(
        { kind: 'clip', id: 'EncouragingClipSlug' },
        'sport-topaz-eta.vercel.app',
        true,
      )['layout'],
      'video-with-chat',
    )
  })

  it('rejects malformed identifiers and unsafe parent values', () => {
    assert.equal(isValidTwitchEmbedMedia({ kind: 'channel', id: '' }), false)
    assert.equal(isValidTwitchEmbedMedia({ kind: 'video', id: 'not-a-number' }), false)
    assert.equal(isValidTwitchEmbedMedia({ kind: 'clip', id: 'clip/123' }), false)
    assert.throws(() =>
      getTwitchEmbedOptions(
        { kind: 'channel', id: 'sports_channel' },
        'https://sport-topaz-eta.vercel.app',
      ),
    )
  })

  it('uses content-specific errors instead of calling every failure a broadcast error', () => {
    assert.match(getTwitchPlayerErrorMessage('channel'), /channel/)
    assert.match(getTwitchPlayerErrorMessage('video'), /VOD/)
    assert.match(getTwitchPlayerErrorMessage('clip'), /clip/)
  })
})
