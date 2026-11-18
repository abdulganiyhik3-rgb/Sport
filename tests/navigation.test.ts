import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MEMBERSHIP_NAV_ITEM,
  MORE_NAV_ITEMS,
  PRIMARY_NAV_ITEMS,
  isMoreNavItemActive,
} from '@/lib/sportivra/navigation'

describe('SPORTIVRA header navigation contract', () => {
  it('keeps the requested primary navigation order and destinations', () => {
    assert.deepEqual(
      PRIMARY_NAV_ITEMS.map((item) => [item.label, item.href, item.id]),
      [
        ['Home', '#top', 'top'],
        ['Sports', '#sports', 'sports'],
        ['Live', '#live', 'live'],
        ['Highlights', '#highlights', 'highlights'],
      ],
    )
  })

  it('keeps secondary destinations in More while leaving Membership separate', () => {
    assert.deepEqual(
      MORE_NAV_ITEMS.map((item) => item.label),
      [
        'My Teams',
        'Schedule',
        'Match Centre',
        'Reminders',
        'News',
        'Twitch Sports',
        'Help centre',
      ],
    )
    assert.equal(MEMBERSHIP_NAV_ITEM.label, 'Membership')
    assert.equal(MEMBERSHIP_NAV_ITEM.href, '#pricing')
    assert.equal(new Set(MORE_NAV_ITEMS.map((item) => item.id)).size, MORE_NAV_ITEMS.length)
  })

  it('identifies active secondary destinations for the More trigger', () => {
    assert.equal(isMoreNavItemActive('twitch'), true)
    assert.equal(isMoreNavItemActive('schedule'), true)
    assert.equal(isMoreNavItemActive('pricing'), false)
    assert.equal(isMoreNavItemActive('top'), false)
  })
})
