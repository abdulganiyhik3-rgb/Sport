import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  FOOTER_COMPANY_LINKS,
  FOOTER_PRODUCT_LINKS,
  FOOTER_SECTION_TARGET_IDS,
  FOOTER_SUPPORT_LINKS,
  getFooterAccountLabel,
  getFooterCopyrightLine,
} from '@/lib/sportivra/footer'

describe('SPORTIVRA footer navigation contract', () => {
  it('keeps every in-page footer destination mapped to a real homepage section', () => {
    const sectionTargets = [
      ...FOOTER_PRODUCT_LINKS.filter((link) => link.kind === 'section').map(
        (link) => link.targetId,
      ),
      ...FOOTER_COMPANY_LINKS.filter((link) => link.kind === 'section').map(
        (link) => link.targetId,
      ),
    ]

    assert.deepEqual(sectionTargets, [...FOOTER_SECTION_TARGET_IDS])
    assert.equal(new Set(sectionTargets).size, sectionTargets.length)
  })

  it('keeps important footer actions distinct from in-page navigation', () => {
    const scoresLink = FOOTER_PRODUCT_LINKS.find(
      (link) => link.label === 'Scores',
    )
    const sportsNewsLink = FOOTER_COMPANY_LINKS.find(
      (link) => link.label === 'Sports News',
    )

    assert.deepEqual(scoresLink, {
      label: 'Scores',
      kind: 'action',
      action: 'scores',
    })
    assert.equal(sportsNewsLink?.kind, 'section')
    assert.equal(sportsNewsLink?.href, '#news')
    assert.equal(FOOTER_SUPPORT_LINKS.length, 3)
  })

  it('keeps the account action label truthful for signed-out and signed-in users', () => {
    assert.equal(getFooterAccountLabel(false), 'Sign in')
    assert.equal(getFooterAccountLabel(true), 'My Account')
  })

  it('renders a current-year copyright line without hardcoded presentation text', () => {
    assert.equal(
      getFooterCopyrightLine(2026),
      '© 2026 SPORTIVRA. All rights reserved.',
    )
    assert.equal(
      getFooterCopyrightLine(2027),
      '© 2027 SPORTIVRA. All rights reserved.',
    )
    assert.equal(
      getFooterCopyrightLine(),
      `© ${new Date().getFullYear()} SPORTIVRA. All rights reserved.`,
    )
  })
})
