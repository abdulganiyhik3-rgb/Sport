export type FooterInfoTopic =
  | 'About us'
  | 'Careers'
  | 'Help centre'
  | 'Privacy'
  | 'Terms'

export const FOOTER_PRODUCT_LINKS = [
  { label: 'Live Matches', kind: 'section', href: '#live', targetId: 'live' },
  { label: 'Scores', kind: 'action', action: 'scores' },
  {
    label: 'Highlights',
    kind: 'section',
    href: '#highlights',
    targetId: 'highlights',
  },
  { label: 'Schedule', kind: 'section', href: '#schedule', targetId: 'schedule' },
  {
    label: 'Favourite Sports',
    kind: 'section',
    href: '#my-sports',
    targetId: 'my-sports',
  },
  { label: 'My Teams', kind: 'section', href: '#my-teams', targetId: 'my-teams' },
  { label: 'Membership', kind: 'section', href: '#pricing', targetId: 'pricing' },
] as const

export const FOOTER_COMPANY_LINKS = [
  { label: 'About us', kind: 'info', topic: 'About us' },
  { label: 'Careers', kind: 'info', topic: 'Careers' },
  { label: 'Sports News', kind: 'section', href: '#news', targetId: 'news' },
] as const

export const FOOTER_SUPPORT_LINKS = [
  { label: 'Help centre', topic: 'Help centre' },
  { label: 'Privacy policy', topic: 'Privacy' },
  { label: 'Terms of use', topic: 'Terms' },
] as const

export const FOOTER_SECTION_TARGET_IDS = [
  'live',
  'highlights',
  'schedule',
  'my-sports',
  'my-teams',
  'pricing',
  'news',
] as const

export function getFooterAccountLabel(isAuthenticated: boolean):
  | 'My Account'
  | 'Sign in' {
  return isAuthenticated ? 'My Account' : 'Sign in'
}

export function getFooterCopyrightLine(
  year: number = new Date().getFullYear(),
): string {
  const resolvedYear = Number.isFinite(year)
    ? Math.trunc(year)
    : new Date().getFullYear()

  return `© ${resolvedYear} SPORTIVRA. All rights reserved.`
}
