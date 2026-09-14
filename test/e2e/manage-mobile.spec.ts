// /clients and /tags row layout at phone width: the name/tag
// track used `minmax(0, …)` while the other tracks were bare `1fr` (i.e.
// `minmax(auto, 1fr)`, which refuses to shrink below its content). At 390px
// the flexible track absorbed the whole shortfall and collapsed toward zero
// — client names went invisible and the header row's "Client"/"Rate" labels
// overlapped. Fixed by stacking each row (name/tag on its own line, the rest
// in a smaller muted line below, actions on their own line) below `sm` and
// hiding the column-header row entirely below `sm` (nothing left to
// overlap). Runs in the `mobile` project only — 390×844. Read-only: both
// pages render from the seed, so there is no fixture to clean up.
import { expect, test } from './helpers/test'

/** The row's first direct-child cell — the name (clients) or #tag chip
 * (tags). Direct-child (`>`) excludes the secondary-figure cells, which sit
 * one level deeper inside the `sm:contents` wrapper, and the header row,
 * whose cells are `role="columnheader"` rather than `role="cell"`. */
function primaryCells(page: import('@playwright/test').Page) {
  return page.locator('[role="row"] > [role="cell"]:first-child')
}

test.describe('mobile client/tag rows', { tag: '@mobile' }, () => {
  test('/clients: names are readable and the header row does not overlap', async ({ page }) => {
    await page.goto('/clients')

    const names = primaryCells(page)
    const count = await names.count()
    expect(count, 'seeded clients rendered').toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      const box = await names.nth(i).boundingBox()
      expect(box, `client row ${i} name cell has a bounding box`).not.toBeNull()
      expect(box!.width, `client row ${i} name cell width`).toBeGreaterThan(80)
      await expect(names.nth(i)).toBeVisible()
    }

    // The desktop column-header row (Client / Rate / Projects / Tasks /
    // Tracked) is hidden entirely below `sm` — nothing left for it to
    // overlap with the rows.
    await expect(page.getByRole('columnheader', { name: 'Client' })).toBeHidden()
    await expect(page.getByRole('columnheader', { name: 'Rate' })).toBeHidden()

    // The mobile-only suffix words ("projects", "tasks") never push the page
    // into horizontal scroll (WCAG 1.4.10 Reflow).
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth).toBeLessThanOrEqual(390)
  })

  test('/tags: tag chips are readable and the header row does not overlap', async ({ page }) => {
    await page.goto('/tags')

    const chips = primaryCells(page)
    const count = await chips.count()
    expect(count, 'seeded tags rendered').toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      const box = await chips.nth(i).boundingBox()
      expect(box, `tag row ${i} chip cell has a bounding box`).not.toBeNull()
      expect(box!.width, `tag row ${i} chip cell width`).toBeGreaterThan(80)
      await expect(chips.nth(i)).toBeVisible()
    }

    await expect(page.getByRole('columnheader', { name: 'Tag' })).toBeHidden()
    await expect(page.getByRole('columnheader', { name: 'Used on' })).toBeHidden()

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth).toBeLessThanOrEqual(390)
  })
})
