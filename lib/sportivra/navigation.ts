export type SportivraNavAction =
  | 'match-center'
  | 'membership'
  | 'reminders'
  | 'help'

export interface SportivraNavItem {
  readonly label: string
  readonly href: string
  readonly id: string
  readonly action?: SportivraNavAction
}

export const PRIMARY_NAV_ITEMS: readonly SportivraNavItem[] = [
  { label: 'Home', href: '#top', id: 'top' },
  { label: 'Sports', href: '#sports', id: 'sports' },
  { label: 'Live', href: '#live', id: 'live' },
  { label: 'Highlights', href: '#highlights', id: 'highlights' },
]

export const MORE_NAV_ITEMS: readonly SportivraNavItem[] = [
  { label: 'My Teams', href: '#my-teams', id: 'my-teams' },
  { label: 'Schedule', href: '#schedule', id: 'schedule' },
  {
    label: 'Match Centre',
    href: '#scores',
    id: 'scores',
    action: 'match-center',
  },
  {
    label: 'Reminders',
    href: '#reminders',
    id: 'reminders',
    action: 'reminders',
  },
  { label: 'News', href: '#news', id: 'news' },
  { label: 'Twitch Sports', href: '#twitch', id: 'twitch' },
  {
    label: 'Help centre',
    href: '#help',
    id: 'help',
    action: 'help',
  },
]

export const MEMBERSHIP_NAV_ITEM: SportivraNavItem = {
  label: 'Membership',
  href: '#pricing',
  id: 'pricing',
  action: 'membership',
} as const satisfies SportivraNavItem

export function isMoreNavItemActive(activeNavId: string): boolean {
  return MORE_NAV_ITEMS.some((item) => item.id === activeNavId)
}
