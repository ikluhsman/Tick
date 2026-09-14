// /projects on mobile: expanding a project must still show a readable task
// name next to the entries/tracked meta line, not squeeze it out (Tick#22 —
// app/components/manage/TaskRow.vue's below-sm secondary line).
import { expect, test } from './helpers/test'
import { startsWith } from './helpers/fixtures'

test.describe('projects & tasks — mobile task rows', { tag: '@mobile' }, () => {
  test('expanding a project keeps the task name readable next to its entries line', async ({ page }) => {
    await page.goto('/projects')

    // "Website redesign" (server/utils/demo.ts) seeds a collapsed project
    // card with tasks, including "Homepage hero" which has logged entries.
    const projectHeader = page.getByRole('button', { name: startsWith('Website redesign') })
    await expect(projectHeader).toBeVisible()
    await expect(projectHeader).toHaveAttribute('aria-expanded', 'false')
    await projectHeader.click()
    await expect(projectHeader).toHaveAttribute('aria-expanded', 'true')

    // The task's name is still the edit button — same accessible name as on
    // desktop — and must render with real width, not collapse to nothing
    // behind the old fixed entries/tracked/play columns.
    const taskName = page.getByRole('button', { name: startsWith('Homepage hero') })
    await expect(taskName).toBeVisible()
    const box = await taskName.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(80)

    // Its entries + tracked-time secondary line renders too, in smaller text
    // underneath — not just a bare "0"/count with no label. Scoped to this
    // row's own next sibling: the always-visible Standalone tasks card below
    // renders the same secondary-line markup for its own tasks, so an
    // unscoped text match is ambiguous.
    const entriesLine = taskName.locator('xpath=following-sibling::span[1]')
    await expect(entriesLine).toBeVisible()
    await expect(entriesLine).toHaveText(/^\d+ (entry|entries) ·/)
  })
})
