import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getTwitchClipEmbedUrl,
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

  it('maps VOD playback to the official Embed SDK video identifier without chat replay', () => {
    const options = getTwitchEmbedOptions(
      { kind: 'video', id: '123456789' },
      'sport-topaz-eta.vercel.app',
      true,
    )

    assert.equal(options.video, '123456789')
    assert.equal(options.layout, 'video')
  })

  it('enables the official live-channel chat layout only for channels', () => {
    assert.equal(
      getTwitchEmbedOptions(
        { kind: 'channel', id: 'sports_channel' },
        'sport-topaz-eta.vercel.app',
        true,
      ).layout,
      'video-with-chat',
    )
  })

  it('uses the official non-interactive Twitch Clips embed URL', () => {
    assert.equal(
      getTwitchClipEmbedUrl(
        'EncouragingClipSlug',
        'sport-topaz-eta.vercel.app',
      ),
      'https://clips.twitch.tv/embed?clip=EncouragingClipSlug&parent=sport-topaz-eta.vercel.app',
    )
  })

  it('rejects malformed identifiers, unsafe parents, and clip SDK options', () => {
    assert.equal(isValidTwitchEmbedMedia({ kind: 'channel', id: '' }), false)
    assert.equal(isValidTwitchEmbedMedia({ kind: 'video', id: 'not-a-number' }), false)
    assert.equal(isValidTwitchEmbedMedia({ kind: 'clip', id: 'clip/123' }), false)
    assert.throws(() =>
      getTwitchEmbedOptions(
        { kind: 'channel', id: 'sports_channel' },
        'https://sport-topaz-eta.vercel.app',
      ),
    )
    assert.throws(() =>
      getTwitchEmbedOptions(
        { kind: 'clip', id: 'EncouragingClipSlug' },
        'sport-topaz-eta.vercel.app',
      ),
    )
  })

  it('distinguishes offline channels and content-specific player failures', () => {
    assert.match(getTwitchPlayerErrorMessage('channel', 'offline'), /offline/)
    assert.match(getTwitchPlayerErrorMessage('video'), /VOD/)
    assert.match(getTwitchPlayerErrorMessage('clip', 'clip-error'), /clip/)
    assert.match(getTwitchPlayerErrorMessage('channel', 'timeout'), /timed out/)
  })
})
