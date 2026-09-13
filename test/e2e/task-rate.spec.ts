// /projects: giving a task its own hourly rate shows it next to the task's
// name (Tick#16 — server/utils/rates.ts task rung, app/components/manage/TaskRow.vue).
import { expect, test } from './helpers/test'
import { deleteTasksNamed } from './helpers/api'
import { startsWith, uniqueName } from './helpers/fixtures'

const created = new Set<string>()

function name(prefix: string): string {
  const n = uniqueName(prefix)
  created.add(n)
  return n
}

test.afterEach(async ({ api }) => {
  await deleteTasksNamed(api, ...created)
  created.clear()
})

test('setting a task’s rate in the edit form shows $X/h next to its name', async ({ page }) => {
  const taskName = name('E2E rate task')
  await page.goto('/projects')

  // New standalone task (no project) via the page header.
  await page.getByRole('button', { name: 'New task' }).click()
  const createDialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'New task' })
  })
  await expect(createDialog).toBeVisible()
  await createDialog.getByLabel('Name').fill(taskName)
  await createDialog.getByRole('button', { name: 'Create task' }).click()
  await expect(createDialog).toBeHidden()

  // Lands in the Standalone tasks card with no rate shown yet. The generated
  // name is unique per run, so matching it anywhere on the page is unambiguous.
  const row = page.getByRole('button', { name: startsWith(taskName) })
  await expect(row).toBeVisible()
  await expect(row).not.toContainText('/h')

  // Open it back up and give it a rate.
  await row.click()
  const editDialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Edit task' })
  })
  await expect(editDialog).toBeVisible()
  await expect(editDialog.getByLabel('Name')).toHaveValue(taskName)
  await editDialog.getByLabel('Rate').fill('42')
  await editDialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(editDialog).toBeHidden()

  // The row now shows the task's own rate right after its name.
  await expect(row).toContainText('$42/h')

  // Clearing it drops the rate display again.
  await row.click()
  await expect(editDialog).toBeVisible()
  await expect(editDialog.getByLabel('Rate')).toHaveValue('42')
  await editDialog.getByLabel('Rate').fill('')
  await editDialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(editDialog).toBeHidden()
  await expect(row).not.toContainText('/h')
})
