'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDot,
  ExternalLink,
  Eye,
  Film,
  Loader2,
  Maximize2,
  MessageCircle,
  Radio,
  Search,
  ShieldCheck,
  Tv,
  UserPlus,
  Users,
  Video,
  X,
} from 'lucide-react'
import {
  getTwitchEmbedOptions,
  getTwitchPlayerErrorMessage,
  isValidTwitchEmbedMedia,
} from '@/lib/twitch/player'
import type {
  TwitchCategory,
  TwitchClip,
  TwitchFollowedChannel,
  TwitchSchedule,
  TwitchSearchChannel,
  TwitchStream,
  TwitchSubscription,
  TwitchVideo,
} from '@/lib/twitch/types'

interface TwitchEmbedPlayer {
  addEventListener: (event: string, callback: () => void) => void
  getQualities?: () => TwitchQuality[] | Promise<TwitchQuality[]>
  getQuality?: () => string
  setQuality?: (quality: string) => void
}

interface TwitchEmbedInstance {
  addEventListener: (event: string, callback: () => void) => void
  getPlayer: () => TwitchEmbedPlayer
}

interface TwitchEmbedConstructor {
  new (elementId: string, options: Record<string, unknown>): TwitchEmbedInstance
}

declare global {
  interface Window {
    Twitch?: { Embed: TwitchEmbedConstructor }
  }
}

type DiscoveryKind = 'streams' | 'channels' | 'categories' | 'videos' | 'clips'
type PlayerKind = 'channel' | 'video' | 'clip'

type PlayerItem = {
  kind: PlayerKind
  id: string
  title: string
  broadcasterId?: string
  broadcasterName?: string
  channelLogin?: string
}

type TwitchConnection = {
  connected: boolean
  user: { id: string; login: string; displayName: string } | null
  scopes: string[]
}

type ApiPage<T> = {
  data: T[]
  pagination?: { cursor?: string }
}

type TwitchConfig = {
  configured: boolean
  oauthConfigured: boolean
}

type TwitchQuality = {
  group?: string
  id: string
  label: string
}

let twitchEmbedScriptPromise: Promise<void> | null = null
const TWITCH_EMBED_LOAD_TIMEOUT_MS = 15_000

function waitForTwitchEmbedGlobal(): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const check = () => {
      if (window.Twitch?.Embed) {
        resolve()
        return
      }
      if (Date.now() - startedAt >= TWITCH_EMBED_LOAD_TIMEOUT_MS) {
        reject(new Error('The official Twitch player could not be loaded.'))
        return
      }
      window.setTimeout(check, 50)
    }
    check()
  })
}

function loadTwitchEmbedScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Twitch player is only available in a browser.'))
  }
  if (window.Twitch?.Embed) return Promise.resolve()
  if (twitchEmbedScriptPromise) return twitchEmbedScriptPromise

  const promise = (async () => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-twitch-embed-sdk="true"]',
    )

    if (!existing) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        script.src = 'https://player.twitch.tv/js/embed/v1.js'
        script.async = true
        script.dataset.twitchEmbedSdk = 'true'
        script.onload = () => resolve()
        script.onerror = () =>
          reject(new Error('The official Twitch player could not be loaded.'))
        document.head.appendChild(script)
      })
    }

    // Polling also handles an SDK script that was loaded before this component
    // mounted, where a late-added load listener would never fire.
    await waitForTwitchEmbedGlobal()
  })()

  twitchEmbedScriptPromise = promise.catch((error: unknown) => {
    twitchEmbedScriptPromise = null
    throw error
  })
  return twitchEmbedScriptPromise
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-NG', { notation: 'compact' }).format(value)
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatDuration(value: string | number): string {
  if (typeof value === 'number') return `${Math.round(value)}s`
  return value
    .replace(/h/g, 'h ')
    .replace(/m/g, 'm ')
    .replace(/s/g, 's')
    .trim()
}

function twitchLink(item: PlayerItem): string {
  if (item.kind === 'channel') return `https://www.twitch.tv/${item.id}`
  if (item.kind === 'video') return `https://www.twitch.tv/videos/${item.id}`
  return `https://clips.twitch.tv/${item.id}`
}

function normalizeQualities(value: unknown): TwitchQuality[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (entry): entry is TwitchQuality =>
      Boolean(
        entry &&
          typeof entry === 'object' &&
          'id' in entry &&
          'label' in entry &&
          typeof entry.id === 'string' &&
          typeof entry.label === 'string',
      ),
  )
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null
  if (!response.ok) {
    throw new Error(
      body && typeof body.error === 'string'
        ? body.error
        : 'The Twitch request could not be completed.',
    )
  }
  return body as T
}

function connectTwitchUrl(scopes = 'follow'): string {
  if (typeof window === 'undefined') return '#'
  return `/api/twitch/oauth/start?scopes=${encodeURIComponent(
    scopes,
  )}&returnTo=${encodeURIComponent(window.location.pathname)}`
}

function TwitchPlayer({
  item,
  onClose,
  onCreateClip,
  canCreateClip,
  clipLoading,
}: {
  item: PlayerItem
  onClose: () => void
  onCreateClip: (() => void) | null
  canCreateClip: boolean
  clipLoading: boolean
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<TwitchEmbedPlayer | null>(null)
  const [chatEnabled, setChatEnabled] = useState(false)
  const [ready, setReady] = useState(false)
  const [playerError, setPlayerError] = useState<string | null>(null)
  const [qualities, setQualities] = useState<TwitchQuality[]>([])
  const [quality, setQuality] = useState('')

  useEffect(() => {
    setChatEnabled(false)
    setReady(false)
    setPlayerError(null)
    setQualities([])
    setQuality('')
  }, [item.id, item.kind])

  useEffect(() => {
    let cancelled = false

    async function initializePlayer() {
      try {
        const media = { kind: item.kind, id: item.id }
        if (!isValidTwitchEmbedMedia(media)) {
          throw new Error('Twitch returned an invalid channel, VOD, or clip identifier.')
        }

        await loadTwitchEmbedScript()
        if (cancelled) return
        if (!containerRef.current || !window.Twitch?.Embed) {
          throw new Error('The official Twitch player could not be loaded.')
        }

        containerRef.current.replaceChildren()
        const containerId = 'sportivra-twitch-embed'
        containerRef.current.id = containerId
        const options = getTwitchEmbedOptions(
          media,
          window.location.hostname,
          chatEnabled,
        )

        const embed = new window.Twitch.Embed(containerId, options)
        const onReady = () => {
          if (cancelled) return
          try {
            const player = embed.getPlayer()
            playerRef.current = player
            setReady(true)
            const qualityResult = player.getQualities?.()
            Promise.resolve(qualityResult)
              .then((nextQualities) => {
                if (cancelled) return
                const normalized = normalizeQualities(nextQualities)
                setQualities(normalized)
                setQuality(player.getQuality?.() || normalized[0]?.id || '')
              })
              .catch(() => {
                if (!cancelled) setQualities([])
              })
          } catch {
            if (!cancelled) {
              setPlayerError(getTwitchPlayerErrorMessage(item.kind))
            }
          }
        }
        embed.addEventListener('VIDEO_READY', onReady)
        embed.addEventListener('VIDEO_ERROR', () => {
          if (!cancelled) {
            setPlayerError(getTwitchPlayerErrorMessage(item.kind))
          }
        })
      } catch (error) {
        if (!cancelled) {
          setPlayerError(
            error instanceof Error
              ? error.message
              : getTwitchPlayerErrorMessage(item.kind),
          )
        }
      }
    }

    void initializePlayer()
    return () => {
      cancelled = true
      playerRef.current = null
      containerRef.current?.replaceChildren()
    }
  }, [chatEnabled, item])

  const toggleFullscreen = async () => {
    if (!frameRef.current) return
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await frameRef.current.requestFullscreen?.()
      }
    } catch {
      setPlayerError('Fullscreen is not available in this browser or embedded context.')
    }
  }

  return (
    <div
      ref={frameRef}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-black shadow-xl dark:border-white/10"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#0b1220] px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#39ff14]">
            <Radio size={12} /> Official Twitch player
          </p>
          <p className="mt-1 truncate text-sm font-bold">{item.title}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-[#39ff14]"
          aria-label="Close Twitch player"
        >
          <X size={18} />
        </button>
      </div>

      <div className="relative aspect-video min-h-[240px] bg-black md:min-h-[420px]">
        <div ref={containerRef} className="h-full w-full" />
        {!ready && !playerError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0b1220] p-6 text-center text-white">
            <Loader2 size={28} className="mb-3 animate-spin text-[#39ff14]" />
            <p className="text-sm font-bold">Loading Twitch playback</p>
            <p className="mt-1 text-xs text-white/60">
              The official player will provide fullscreen, quality and chat controls.
            </p>
          </div>
        )}
        {playerError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0b1220] p-6 text-center text-white">
            <Tv size={30} className="mb-3 text-[#ff8b91]" />
            <p className="text-sm font-bold">Twitch playback unavailable</p>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-white/65">
              {playerError}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-[#0b1220] p-3 text-xs text-white/70">
        {qualities.length > 0 && (
          <label className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/15 px-3">
            <span>Quality</span>
            <select
              value={quality}
              onChange={(event) => {
                const next = event.target.value
                setQuality(next)
                try {
                  playerRef.current?.setQuality?.(next)
                } catch {
                  setPlayerError('Twitch did not accept that quality setting.')
                }
              }}
              className="bg-transparent font-semibold text-white outline-none"
              aria-label="Twitch video quality"
            >
              {qualities.map((entry) => (
                <option key={entry.id} value={entry.id} className="bg-[#0b1220]">
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          onClick={() => setChatEnabled((enabled) => !enabled)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/15 px-3 transition hover:border-[#39ff14] hover:text-[#39ff14] focus-visible:outline-[#39ff14]"
          aria-pressed={chatEnabled}
        >
          <MessageCircle size={14} /> {chatEnabled ? 'Hide chat' : 'Show chat'}
        </button>
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/15 px-3 transition hover:border-[#39ff14] hover:text-[#39ff14] focus-visible:outline-[#39ff14]"
        >
          <Maximize2 size={14} /> Fullscreen
        </button>
        {canCreateClip && onCreateClip && (
          <button
            type="button"
            onClick={onCreateClip}
            disabled={clipLoading}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[#39ff14]/50 px-3 text-[#39ff14] transition hover:bg-[#39ff14]/10 disabled:opacity-60 focus-visible:outline-[#39ff14]"
          >
            {clipLoading ? <Loader2 size={14} className="animate-spin" /> : <Film size={14} />}
            {clipLoading ? 'Creating clip...' : 'Create clip'}
          </button>
        )}
        <a
          href={twitchLink(item)}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-white/70 transition hover:text-[#39ff14] hover:underline focus-visible:outline-[#39ff14]"
        >
          Open on Twitch <ExternalLink size={13} />
        </a>
      </div>
    </div>
  )
}

function StreamCard({
  stream,
  onWatch,
}: {
  stream: TwitchStream
  onWatch: () => void
}) {
  const thumbnail = stream.thumbnail_url
    .replace('{width}', '640')
    .replace('{height}', '360')

  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-[#0f7a06]/50 hover:shadow-md dark:border-white/10 dark:bg-[#0e1727] dark:shadow-none dark:hover:border-[#39ff14]/45">
      <button type="button" onClick={onWatch} className="block w-full text-left focus-visible:outline-[#0f7a06] dark:focus-visible:outline-[#39ff14]">
        <div className="relative aspect-video overflow-hidden bg-[#0b1220]">
          <img src={thumbnail} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-[#ff3b45] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
            <CircleDot size={11} /> Live
          </span>
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded bg-black/75 px-2 py-1 text-[11px] font-semibold text-white">
            <Users size={12} /> {formatCount(stream.viewer_count)} watching
          </span>
        </div>
        <div className="p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#0f7a06] dark:text-[#39ff14]">
            {stream.game_name || 'Sports stream'}
          </p>
          <h3 className="mt-1 line-clamp-2 text-sm font-bold text-[#0b1220] dark:text-white">
            {stream.title}
          </h3>
          <p className="mt-2 text-xs text-slate-600 dark:text-white/60">
            {stream.user_name} · live since {formatDate(stream.started_at)}
          </p>
        </div>
      </button>
    </article>
  )
}

function ChannelCard({
  channel,
  followed,
  onWatch,
  onFollow,
  onVideos,
  onClips,
  onSchedule,
}: {
  channel: TwitchSearchChannel
  followed: boolean
  onWatch: () => void
  onFollow: () => void
  onVideos: () => void
  onClips: () => void
  onSchedule: () => void
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0e1727] dark:shadow-none">
      <div className="flex items-start gap-3">
        <img src={channel.thumbnail_url} alt="" className="h-12 w-12 rounded-full object-cover" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-bold text-[#0b1220] dark:text-white">
              {channel.display_name}
            </h3>
            {channel.is_live && (
              <span className="rounded-full bg-[#ff3b45]/15 px-2 py-0.5 text-[10px] font-bold uppercase text-[#c21f2c] dark:text-[#ff8b91]">
                Live
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-white/60">
            {channel.title || channel.game_name || 'Twitch channel'}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onWatch} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#39ff14] px-3.5 text-xs font-bold text-[#0b1220] transition hover:bg-[#5cff3d] focus-visible:outline-[#0f7a06]">
          <Video size={13} /> Watch
        </button>
        <button type="button" onClick={onFollow} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-slate-300 px-3.5 text-xs font-bold text-[#0b1220] transition hover:border-[#0f7a06] hover:text-[#0f7a06] dark:border-white/15 dark:text-white dark:hover:border-[#39ff14] dark:hover:text-[#39ff14] focus-visible:outline-[#0f7a06] dark:focus-visible:outline-[#39ff14]" aria-pressed={followed}>
          {followed ? <Check size={13} /> : <UserPlus size={13} />}
          {followed ? 'Following' : 'Follow'}
        </button>
        <button type="button" onClick={onVideos} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-slate-300 px-3.5 text-xs font-semibold text-slate-700 transition hover:border-[#0f7a06] hover:text-[#0f7a06] dark:border-white/15 dark:text-white/75 dark:hover:border-[#39ff14] dark:hover:text-[#39ff14] focus-visible:outline-[#0f7a06] dark:focus-visible:outline-[#39ff14]">
          <Video size={13} /> VODs
        </button>
        <button type="button" onClick={onClips} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-slate-300 px-3.5 text-xs font-semibold text-slate-700 transition hover:border-[#0f7a06] hover:text-[#0f7a06] dark:border-white/15 dark:text-white/75 dark:hover:border-[#39ff14] dark:hover:text-[#39ff14] focus-visible:outline-[#0f7a06] dark:focus-visible:outline-[#39ff14]">
          <Film size={13} /> Clips
        </button>
        <button type="button" onClick={onSchedule} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-slate-300 px-3.5 text-xs font-semibold text-slate-700 transition hover:border-[#0f7a06] hover:text-[#0f7a06] dark:border-white/15 dark:text-white/75 dark:hover:border-[#39ff14] dark:hover:text-[#39ff14] focus-visible:outline-[#0f7a06] dark:focus-visible:outline-[#39ff14]">
          <CalendarDays size={13} /> Schedule
        </button>
      </div>
    </article>
  )
}

function CategoryCard({
  category,
  onWatch,
}: {
  category: TwitchCategory
  onWatch: () => void
}) {
  const image = category.box_art_url.replace('{width}', '285').replace('{height}', '380')
  return (
    <button type="button" onClick={onWatch} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#0f7a06]/50 hover:shadow-md dark:border-white/10 dark:bg-[#0e1727] dark:shadow-none dark:hover:border-[#39ff14]/45 focus-visible:outline-[#0f7a06] dark:focus-visible:outline-[#39ff14]">
      <div className="aspect-[4/5] overflow-hidden bg-[#0b1220]">
        <img src={image} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
      </div>
      <div className="p-4">
        <p className="text-sm font-bold text-[#0b1220] dark:text-white">{category.name}</p>
        <p className="mt-1 text-xs text-slate-600 dark:text-white/60">Find live channels in this category</p>
      </div>
    </button>
  )
}

function VideoCard({
  video,
  onWatch,
}: {
  video: TwitchVideo
  onWatch: () => void
}) {
  return (
    <button type="button" onClick={onWatch} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#0f7a06]/50 hover:shadow-md dark:border-white/10 dark:bg-[#0e1727] dark:shadow-none dark:hover:border-[#39ff14]/45 focus-visible:outline-[#0f7a06] dark:focus-visible:outline-[#39ff14]">
      <div className="relative aspect-video overflow-hidden bg-[#0b1220]">
        <img src={video.thumbnail_url.replace('%{width}', '640').replace('%{height}', '360')} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        <span className="absolute bottom-3 left-3 rounded bg-black/75 px-2 py-1 text-[11px] font-semibold text-white">{formatDuration(video.duration)}</span>
      </div>
      <div className="p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-[#0f7a06] dark:text-[#39ff14]">{video.type}</p>
        <p className="mt-1 line-clamp-2 text-sm font-bold text-[#0b1220] dark:text-white">{video.title}</p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600 dark:text-white/60"><Eye size={13} /> {formatCount(video.view_count)} views</p>
      </div>
    </button>
  )
}

function ClipCard({
  clip,
  onWatch,
}: {
  clip: TwitchClip
  onWatch: () => void
}) {
  return (
    <button type="button" onClick={onWatch} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#0f7a06]/50 hover:shadow-md dark:border-white/10 dark:bg-[#0e1727] dark:shadow-none dark:hover:border-[#39ff14]/45 focus-visible:outline-[#0f7a06] dark:focus-visible:outline-[#39ff14]">
      <div className="relative aspect-video overflow-hidden bg-[#0b1220]">
        <img src={clip.thumbnail_url} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        <span className="absolute bottom-3 left-3 rounded bg-black/75 px-2 py-1 text-[11px] font-semibold text-white">{formatDuration(clip.duration)}</span>
      </div>
      <div className="p-4">
        <p className="text-sm font-bold text-[#0b1220] dark:text-white">{clip.title}</p>
        <p className="mt-2 text-xs text-slate-600 dark:text-white/60">{clip.broadcaster_name} · {formatCount(clip.view_count)} views</p>
      </div>
    </button>
  )
}

function SchedulePanel({ schedule }: { schedule: TwitchSchedule }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#0e1727] dark:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#0f7a06] dark:text-[#39ff14]">Twitch schedule</p>
          <h3 className="mt-1 text-lg font-bold text-[#0b1220] dark:text-white">{schedule.broadcaster_name}</h3>
        </div>
        <CalendarDays size={20} className="text-[#0f7a06] dark:text-[#39ff14]" />
      </div>
      {schedule.segments.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600 dark:text-white/60">This channel has not published upcoming schedule segments.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {schedule.segments.map((segment) => (
            <div key={segment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 dark:border-white/10 dark:bg-[#0b1220]">
              <div>
                <p className="text-sm font-semibold text-[#0b1220] dark:text-white">{segment.title}</p>
                <p className="mt-1 text-xs text-slate-600 dark:text-white/60">{segment.category?.name || 'Category not specified'}</p>
              </div>
              <p className="text-xs font-semibold text-[#0f7a06] dark:text-[#39ff14]">{formatDate(segment.start_time)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function TwitchHub() {
  const [config, setConfig] = useState<TwitchConfig | null>(null)
  const [connection, setConnection] = useState<TwitchConnection>({
    connected: false,
    user: null,
    scopes: [],
  })
  const [kind, setKind] = useState<DiscoveryKind>('streams')
  const [query, setQuery] = useState('sports')
  const [results, setResults] = useState<unknown[]>([])
  const [cursor, setCursor] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const discoveryRequestId = useRef(0)
  const [error, setError] = useState<string | null>(null)
  const [playerItem, setPlayerItem] = useState<PlayerItem | null>(null)
  const [schedule, setSchedule] = useState<TwitchSchedule | null>(null)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set())
  const [alertsEnabled, setAlertsEnabled] = useState(false)
  const [alertMessage, setAlertMessage] = useState<string | null>(null)
  const previousLiveIds = useRef<Set<string>>(new Set())
  const [subscriptions, setSubscriptions] = useState<{
    total: number
    data: TwitchSubscription[]
  } | null>(null)
  const [subscriptionLoading, setSubscriptionLoading] = useState(false)
  const [clipLoading, setClipLoading] = useState(false)
  const [clipMessage, setClipMessage] = useState<string | null>(null)

  const loadConnection = useCallback(async () => {
    const response = await fetch('/api/twitch/me', { cache: 'no-store' })
    if (response.status === 401) {
      setConnection({ connected: false, user: null, scopes: [] })
      return
    }
    if (!response.ok) return
    const next = await response.json()
    setConnection(next)
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/twitch/config', { cache: 'no-store' }).then((response) => response.json()),
      loadConnection(),
    ]).then(([nextConfig]) => {
      if (!cancelled) setConfig(nextConfig)
    }).catch(() => {
      if (!cancelled) setConfig({ configured: false, oauthConfigured: false })
    })
    return () => {
      cancelled = true
    }
  }, [loadConnection])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('twitch') === 'connected'
    const errorCode = params.get('twitch_error')
    if (connected) {
      setAlertMessage('Twitch is connected. Public discovery and approved account tools are ready.')
    } else if (errorCode) {
      const messages: Record<string, string> = {
        authorization_denied: 'Twitch authorization was not granted.',
        invalid_state: 'Twitch security validation failed. Please start the connection again.',
        missing_code: 'Twitch did not return an authorization code.',
        connection_failed: 'Twitch could not complete the connection.',
      }
      setAlertMessage(messages[errorCode] || 'Twitch connection could not be completed.')
    } else {
      return
    }

    params.delete('twitch')
    params.delete('twitch_error')
    const nextSearch = params.toString()
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`,
    )
  }, [])

  const loadFollowedIds = useCallback(async () => {
    if (!connection.connected) return
    try {
      const response = await fetch('/api/twitch/followed', { cache: 'no-store' })
      if (!response.ok) return
      const body = await response.json() as ApiPage<TwitchFollowedChannel>
      setFollowedIds(new Set(body.data.map((channel) => channel.broadcaster_id)))
    } catch {
      // Follow state is optional discovery context; keep the public catalogue usable.
    }
  }, [connection.connected])

  useEffect(() => {
    void loadFollowedIds()
  }, [loadFollowedIds])

  const loadDiscover = useCallback(async (
    nextKind: DiscoveryKind = kind,
    nextQuery: string = query,
    extra: { gameId?: string; userId?: string; broadcasterId?: string } = {},
    append = false,
  ) => {
    const requestId = ++discoveryRequestId.current
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ kind: nextKind, first: '20' })
      if (nextQuery.trim()) params.set('q', nextQuery.trim())
      if (cursor && append) params.set('after', cursor)
      for (const [key, value] of Object.entries(extra)) {
        if (value) params.set(key, value)
      }
      const response = await fetch(`/api/twitch/discover?${params}`, { cache: 'no-store' })
      const body = await readApiResponse<ApiPage<unknown> & { matchedCategories?: TwitchCategory[] }>(response)
      if (requestId !== discoveryRequestId.current) return
      setResults((current) => append ? [...current, ...body.data] : body.data)
      setCursor(body.pagination?.cursor)
    } catch (err) {
      if (requestId !== discoveryRequestId.current) return
      setError(err instanceof Error ? err.message : 'Unable to load Twitch discovery results.')
      if (!append) setResults([])
    } finally {
      if (requestId === discoveryRequestId.current) setLoading(false)
    }
  }, [cursor, kind, query])

  useEffect(() => {
    if (config?.configured) void loadDiscover('streams', 'sports')
  }, [config?.configured]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectKind = (nextKind: DiscoveryKind) => {
    setKind(nextKind)
    setCursor(undefined)
    setResults([])
    setSchedule(null)
    setError(null)
  }

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault()
    setCursor(undefined)
    setSchedule(null)
    void loadDiscover(kind, query)
  }

  const openChannel = (channel: TwitchSearchChannel) => {
    setPlayerItem({
      kind: 'channel',
      id: channel.broadcaster_login,
      title: channel.title || `${channel.display_name} on Twitch`,
      broadcasterId: channel.id,
      broadcasterName: channel.display_name,
      channelLogin: channel.broadcaster_login,
    })
    setSubscriptions(null)
    setClipMessage(null)
  }

  const openStream = (stream: TwitchStream) => {
    setPlayerItem({
      kind: 'channel',
      id: stream.user_login,
      title: stream.title,
      broadcasterId: stream.user_id,
      broadcasterName: stream.user_name,
      channelLogin: stream.user_login,
    })
    setSubscriptions(null)
    setClipMessage(null)
  }

  const toggleFollow = async (channel: TwitchSearchChannel) => {
    if (!config?.oauthConfigured) {
      setError('Twitch OAuth is not configured on the server yet.')
      return
    }
    if (!connection.connected || !connection.scopes.includes('user:edit:follows')) {
      window.location.assign(connectTwitchUrl('follow'))
      return
    }
    const followed = followedIds.has(channel.id)
    try {
      const response = await fetch('/api/twitch/follow', {
        method: followed ? 'DELETE' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ broadcasterId: channel.id }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        setError(body?.error || 'Unable to update your Twitch follow.')
        return
      }
      setFollowedIds((current) => {
        const next = new Set(current)
        if (followed) next.delete(channel.id)
        else next.add(channel.id)
        return next
      })
    } catch {
      setError('Unable to reach Twitch. Please try again.')
    }
  }

  const loadChannelVideos = async (channel: TwitchSearchChannel) => {
    setKind('videos')
    setQuery(channel.display_name)
    setCursor(undefined)
    await loadDiscover('videos', '', { userId: channel.id })
  }

  const loadChannelClips = async (channel: TwitchSearchChannel) => {
    setKind('clips')
    setQuery(channel.display_name)
    setCursor(undefined)
    await loadDiscover('clips', '', { broadcasterId: channel.id })
  }

  const loadChannelSchedule = async (channel: TwitchSearchChannel) => {
    setSchedule(null)
    setScheduleLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/twitch/discover?kind=schedule&broadcasterId=${encodeURIComponent(channel.id)}`, { cache: 'no-store' })
      setSchedule(await readApiResponse<TwitchSchedule>(response))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load the Twitch schedule.')
    } finally {
      setScheduleLoading(false)
    }
  }

  const loadSubscriptions = async () => {
    if (!playerItem?.broadcasterId || !connection.user || playerItem.broadcasterId !== connection.user.id) return
    setSubscriptionLoading(true)
    try {
      const response = await fetch(`/api/twitch/subscriptions?broadcasterId=${encodeURIComponent(playerItem.broadcasterId)}`, { cache: 'no-store' })
      const body = await readApiResponse<{ total: number; data: TwitchSubscription[] }>(response)
      setSubscriptions(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load Twitch subscriptions.')
    } finally {
      setSubscriptionLoading(false)
    }
  }

  const createClip = async () => {
    if (!playerItem?.broadcasterId) return
    setClipLoading(true)
    setClipMessage(null)
    try {
      const response = await fetch('/api/twitch/clips', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ broadcasterId: playerItem.broadcasterId }),
      })
      const body = await readApiResponse<{ data?: { id: string; edit_url: string }[] }>(response)
      const clip = body.data?.[0]
      setClipMessage(clip ? `Clip created. Edit it here: ${clip.edit_url}` : 'Twitch accepted the clip request.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create the Twitch clip.')
    } finally {
      setClipLoading(false)
    }
  }

  const loadFollowedLive = async () => {
    if (
      !connection.connected ||
      !connection.scopes.includes('user:read:follows')
    ) {
      if (config?.oauthConfigured) window.location.assign(connectTwitchUrl('follow'))
      else setError('Twitch OAuth is not configured on the server yet.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/twitch/notifications', { cache: 'no-store' })
      const body = await readApiResponse<{ live: TwitchStream[] }>(response)
      setKind('streams')
      setQuery('My followed channels')
      setResults(body.live)
      setCursor(undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load followed Twitch channels.')
    } finally {
      setLoading(false)
    }
  }

  const enableAlerts = async () => {
    if (!config?.oauthConfigured) {
      setAlertMessage('Twitch OAuth is not configured on the server yet.')
      return
    }
    if (
      !connection.connected ||
      !connection.scopes.includes('user:read:follows')
    ) {
      window.location.assign(connectTwitchUrl('follow'))
      return
    }
    if (!('Notification' in window)) {
      setAlertMessage('Browser notifications are not supported on this device.')
      return
    }
    let permission: NotificationPermission
    try {
      permission = await Notification.requestPermission()
    } catch {
      setAlertMessage('This browser did not allow notification permission to be requested.')
      return
    }
    if (permission !== 'granted') {
      setAlertMessage('Notifications remain disabled. You can enable them in your browser settings.')
      return
    }
    setAlertsEnabled(true)
    setAlertMessage('Live alerts enabled on this device while SPORTIVRA is open.')
  }

  useEffect(() => {
    if (!alertsEnabled) return
    const poll = async () => {
      try {
        const response = await fetch('/api/twitch/notifications', { cache: 'no-store' })
        if (!response.ok) return
        const body = await response.json() as { live?: TwitchStream[] }
        const live = Array.isArray(body.live) ? body.live : []
        const liveIds = new Set(live.map((stream) => stream.id))
        for (const stream of live) {
          if (!previousLiveIds.current.has(stream.id) && previousLiveIds.current.size > 0) {
            new Notification(`${stream.user_name} is live on Twitch`, {
              body: stream.title,
              icon: '/icon.svg',
            })
          }
        }
        previousLiveIds.current = liveIds
      } catch {
        // Browser alerts are best-effort and should not create an unhandled rejection.
      }
    }
    void poll()
    const timer = window.setInterval(() => void poll(), 60_000)
    return () => window.clearInterval(timer)
  }, [alertsEnabled])

  const canCreateClip = Boolean(
    playerItem?.kind === 'channel' &&
      playerItem.broadcasterId &&
      connection.scopes.includes('clips:edit'),
  )
  const canReadSubscriptions = Boolean(
    playerItem?.broadcasterId &&
      connection.user?.id === playerItem.broadcasterId &&
      connection.scopes.includes('channel:read:subscriptions'),
  )

  const resultLabel = useMemo(() => {
    if (kind === 'streams') return 'Live sports streams'
    if (kind === 'channels') return 'Twitch channels'
    if (kind === 'categories') return 'Sports categories'
    if (kind === 'videos') return 'Recorded broadcasts and uploads'
    return 'Twitch clips'
  }, [kind])

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-white/10 dark:bg-[#0e1727] dark:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-5 border-b border-slate-200 pb-6 dark:border-white/10">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.25em] text-[#0f7a06] dark:text-[#39ff14]">
            <Radio size={13} /> Official Twitch integration
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-[#0b1220] sm:text-3xl dark:text-white">
            Discover live sports on Twitch
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-white/65">
            Search official Twitch channels and categories, watch live broadcasts or VODs, explore clips and schedules, follow channels, and use Twitch chat through the official embedded player.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {connection.connected ? (
            <>
              <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#0f7a06]/30 bg-[#39ff14]/10 px-3.5 text-xs font-bold text-[#0f7a06] dark:border-[#39ff14]/35 dark:text-[#39ff14]">
                <Check size={14} /> {connection.user?.displayName || 'Twitch connected'}
              </span>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await fetch('/api/twitch/oauth/disconnect', { method: 'POST' })
                  } catch {
                    // Clear local state even if the server cookie was already gone.
                  } finally {
                    setConnection({ connected: false, user: null, scopes: [] })
                  }
                  setFollowedIds(new Set())
                  previousLiveIds.current = new Set()
                  setAlertsEnabled(false)
                }}
                className="inline-flex min-h-10 items-center rounded-full border border-slate-300 px-3.5 text-xs font-semibold text-slate-700 transition hover:border-red-400 hover:text-red-600 dark:border-white/15 dark:text-white/70 dark:hover:border-[#ff8b91] dark:hover:text-[#ff8b91]"
              >
                Disconnect
              </button>
              {!connection.scopes.includes('clips:edit') && config?.oauthConfigured && (
                <a
                  href={connectTwitchUrl('follow,clips')}
                  className="inline-flex min-h-10 items-center rounded-full border border-slate-300 px-3.5 text-xs font-semibold text-slate-700 transition hover:border-[#0f7a06] hover:text-[#0f7a06] dark:border-white/15 dark:text-white/70 dark:hover:border-[#39ff14] dark:hover:text-[#39ff14]"
                >
                  Enable clip tools
                </a>
              )}
              {!connection.scopes.includes('channel:read:subscriptions') && config?.oauthConfigured && (
                <a
                  href={connectTwitchUrl('follow,subscriptions')}
                  className="inline-flex min-h-10 items-center rounded-full border border-slate-300 px-3.5 text-xs font-semibold text-slate-700 transition hover:border-[#0f7a06] hover:text-[#0f7a06] dark:border-white/15 dark:text-white/70 dark:hover:border-[#39ff14] dark:hover:text-[#39ff14]"
                >
                  Enable broadcaster tools
                </a>
              )}
            </>
          ) : config?.oauthConfigured ? (
            <a
              href={connectTwitchUrl('follow')}
              className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#39ff14] px-4 text-xs font-bold text-[#0b1220] transition hover:bg-[#5cff3d] focus-visible:outline-[#0f7a06]"
            >
              <ShieldCheck size={14} /> Connect Twitch
            </a>
          ) : (
            <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-300 px-4 text-xs font-semibold text-slate-500 dark:border-white/15 dark:text-white/45">
              <ShieldCheck size={14} /> OAuth setup required
            </span>
          )}
        </div>
      </div>

      {!config?.configured && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-200">
          <ShieldCheck size={16} className="mt-0.5 shrink-0" />
          <p>
            Twitch discovery is ready in the interface but waiting for server-only Twitch credentials. Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET for public discovery. Add TWITCH_TOKEN_ENCRYPTION_KEY and either TWITCH_REDIRECT_URI or a trusted APP_URL before enabling OAuth features.
          </p>
        </div>
      )}
      {config?.configured && !config.oauthConfigured && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-200">
          <ShieldCheck size={16} className="mt-0.5 shrink-0" />
          <p>Public Twitch discovery is available. Twitch account connection, follows, alerts and broadcaster tools remain disabled until the encryption key and a trusted OAuth callback origin are configured on the server.</p>
        </div>
      )}

      <form onSubmit={handleSearch} className="mt-6 flex flex-col gap-3 lg:flex-row">
        <label className="sr-only" htmlFor="twitch-discovery-kind">Twitch discovery type</label>
        <select
          id="twitch-discovery-kind"
          value={kind}
          onChange={(event) => selectKind(event.target.value as DiscoveryKind)}
          className="min-h-11 rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-semibold text-[#0b1220] outline-none focus:border-[#0f7a06] dark:border-white/15 dark:bg-[#0b1220] dark:text-white dark:focus:border-[#39ff14]"
        >
          <option value="streams">Live streams</option>
          <option value="channels">Channels</option>
          <option value="categories">Categories</option>
          <option value="videos">VODs</option>
          <option value="clips">Clips</option>
        </select>
        <label className="relative flex min-h-11 flex-1 items-center">
          <Search size={17} className="pointer-events-none absolute left-3.5 text-slate-400 dark:text-white/40" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={kind === 'streams' ? 'Search sports, leagues or channels' : `Search Twitch ${kind}`}
            className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-sm text-[#0b1220] outline-none placeholder:text-slate-400 focus:border-[#0f7a06] dark:border-white/15 dark:bg-[#0b1220] dark:text-white dark:placeholder:text-white/40 dark:focus:border-[#39ff14]"
          />
        </label>
        <button type="submit" disabled={loading || !config?.configured} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0b1220] px-5 text-sm font-bold text-white transition hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#39ff14] dark:text-[#0b1220] dark:hover:bg-[#5cff3d]">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          Search Twitch
        </button>
      </form>

      <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-white/60">
        <span className="font-semibold">Official capabilities:</span>
        <span className="inline-flex items-center gap-1"><Video size={13} /> Live + VODs</span>
        <span className="inline-flex items-center gap-1"><Film size={13} /> Clips</span>
        <span className="inline-flex items-center gap-1"><MessageCircle size={13} /> Chat</span>
        <span className="inline-flex items-center gap-1"><Users size={13} /> Viewer counts</span>
        {connection.connected && (
          <button type="button" onClick={() => void loadFollowedLive()} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-slate-300 px-3 font-semibold transition hover:border-[#0f7a06] hover:text-[#0f7a06] dark:border-white/15 dark:hover:border-[#39ff14] dark:hover:text-[#39ff14]">
            <Users size={13} /> My followed live
          </button>
        )}
        <button type="button" onClick={() => void enableAlerts()} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-slate-300 px-3 font-semibold transition hover:border-[#0f7a06] hover:text-[#0f7a06] dark:border-white/15 dark:hover:border-[#39ff14] dark:hover:text-[#39ff14]" aria-pressed={alertsEnabled}>
          <Bell size={13} /> {alertsEnabled ? 'Alerts enabled' : 'Enable live alerts'}
        </button>
      </div>
      {alertMessage && <p className="mt-3 text-xs font-semibold text-[#0f7a06] dark:text-[#39ff14]">{alertMessage}</p>}
      {error && <p className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-[#ff3b45]/40 dark:bg-[#ff3b45]/10 dark:text-[#ff8b91]">{error}</p>}

      {schedule && <div className="mt-6"><SchedulePanel schedule={schedule} /></div>}
      {scheduleLoading && <div className="mt-6 flex items-center gap-2 text-xs text-slate-600 dark:text-white/60"><Loader2 size={15} className="animate-spin" /> Loading schedule...</div>}
      {clipMessage && <p className="mt-4 rounded-xl border border-[#39ff14]/40 bg-[#39ff14]/10 px-4 py-3 text-xs text-[#0f7a06] dark:text-[#b7ffab]">{clipMessage}</p>}

      <div className="mt-7 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#0f7a06] dark:text-[#39ff14]">Twitch catalogue</p>
          <h3 className="mt-1 text-xl font-bold text-[#0b1220] dark:text-white">{resultLabel}</h3>
        </div>
        {cursor && (
          <button type="button" onClick={() => void loadDiscover(kind, query, {}, true)} disabled={loading} className="inline-flex min-h-10 items-center gap-1 rounded-full border border-slate-300 px-3.5 text-xs font-bold text-slate-700 transition hover:border-[#0f7a06] hover:text-[#0f7a06] disabled:opacity-50 dark:border-white/15 dark:text-white/75 dark:hover:border-[#39ff14] dark:hover:text-[#39ff14]">
            Load more <ChevronRight size={14} />
          </button>
        )}
      </div>

      {loading && results.length === 0 ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => <div key={index} className="aspect-[16/10] animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-[#0b1220]" />)}
        </div>
      ) : results.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-white/15 dark:bg-[#0b1220]">
          <p className="text-sm font-semibold text-[#0b1220] dark:text-white">No Twitch results for this search yet.</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-white/60">Try a sport, league, channel name, or category.</p>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kind === 'streams' && (results as TwitchStream[]).map((stream) => (
            <StreamCard key={stream.id} stream={stream} onWatch={() => openStream(stream)} />
          ))}
          {kind === 'channels' && (results as TwitchSearchChannel[]).map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              followed={followedIds.has(channel.id)}
              onWatch={() => openChannel(channel)}
              onFollow={() => void toggleFollow(channel)}
              onVideos={() => void loadChannelVideos(channel)}
              onClips={() => void loadChannelClips(channel)}
              onSchedule={() => void loadChannelSchedule(channel)}
            />
          ))}
          {kind === 'categories' && (results as TwitchCategory[]).map((category) => (
            <CategoryCard key={category.id} category={category} onWatch={() => { setKind('streams'); setQuery(category.name); setCursor(undefined); void loadDiscover('streams', '', { gameId: category.id }) }} />
          ))}
          {kind === 'videos' && (results as TwitchVideo[]).map((video) => (
            <VideoCard key={video.id} video={video} onWatch={() => setPlayerItem({ kind: 'video', id: video.id, title: video.title, broadcasterId: video.user_id, broadcasterName: video.user_name })} />
          ))}
          {kind === 'clips' && (results as TwitchClip[]).map((clip) => (
            <ClipCard key={clip.id} clip={clip} onWatch={() => setPlayerItem({ kind: 'clip', id: clip.id, title: clip.title, broadcasterId: clip.broadcaster_id, broadcasterName: clip.broadcaster_name })} />
          ))}
        </div>
      )}

      {playerItem && (
        <div className="mt-8 space-y-4">
          <TwitchPlayer
            item={playerItem}
            onClose={() => { setPlayerItem(null); setSubscriptions(null); setClipMessage(null) }}
            canCreateClip={canCreateClip}
            onCreateClip={canCreateClip ? () => void createClip() : null}
            clipLoading={clipLoading}
          />
          {canReadSubscriptions && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-[#0b1220]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-[#0b1220] dark:text-white">Broadcaster subscriptions</p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-white/60">Twitch only exposes this data to the connected broadcaster account.</p>
                </div>
                <button type="button" onClick={() => void loadSubscriptions()} disabled={subscriptionLoading} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-300 px-4 text-xs font-bold text-slate-700 transition hover:border-[#0f7a06] hover:text-[#0f7a06] disabled:opacity-50 dark:border-white/15 dark:text-white/75 dark:hover:border-[#39ff14] dark:hover:text-[#39ff14]">
                  {subscriptionLoading ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
                  {subscriptions ? `${formatCount(subscriptions.total)} subscribers` : 'Load subscriptions'}
                </button>
              </div>
              {subscriptions && <p className="mt-3 text-xs text-slate-600 dark:text-white/60">Twitch returned {subscriptions.data.length} subscriber records for this page. Subscriber data is never sent to the browser until this broadcaster-only action is requested.</p>}
            </div>
          )}
        </div>
      )}

      <p className="mt-7 flex items-start gap-2 text-[11px] leading-relaxed text-slate-500 dark:text-white/50">
        <ShieldCheck size={14} className="mt-0.5 shrink-0 text-[#0f7a06] dark:text-[#39ff14]" />
        Twitch controls playback, chat, quality selection, fullscreen and content availability. SPORTIVRA does not bypass Twitch restrictions or claim rights to broadcasts, VODs or clips.
      </p>
    </div>
  )
}
