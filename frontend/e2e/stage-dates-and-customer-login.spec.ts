import { expect, test } from '@playwright/test'

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL('/', { timeout: 10_000 })
}

async function expandStage(page: import('@playwright/test').Page, stageName: string) {
  await page.waitForLoadState('networkidle')
  const header = page.locator('button', { hasText: stageName }).first()
  await header.waitFor({ state: 'visible' })
  await header.click()
  await expect(page.locator('h4', { hasText: 'Change planned dates' })).toBeVisible({ timeout: 10_000 })
}

/**
 * Two gaps found during the live simulation: (1) the backend has always
 * accepted planned_start/planned_end on a stage, but no UI ever exposed
 * it for any role, and the endpoint itself was PC-only even though the
 * agreed rule is "Sales Manager and PC can modify the dates"; (2) a
 * project's Customer login could only ever be created/reset by the Owner
 * from a page Sales Manager/PC can't see, even though PC is the one who
 * needs the customer logged in to record SAT/training/handover.
 */
test('Sales Manager can set a stage\'s planned dates; PC keeps status/notes exclusively', async ({ page }) => {
  await login(page, 'sana@businesslinks-pk.com', 'Password123!')
  await page.goto('/orders/1')
  await expandStage(page, 'Machine manufacturing progress')

  const datesForm = page.locator('h4', { hasText: 'Change planned dates' }).locator('xpath=ancestor::div[contains(@class,"bg-slate-50")][1]')
  await datesForm.locator('input[type="date"]').first().fill('2026-01-15')
  await datesForm.locator('input[placeholder="Reason (required)"]').fill('Supplier confirmed manufacturing slot')
  await datesForm.locator('button:has-text("Save")').click()
  await expect(datesForm.locator('text=Planned dates saved.')).toBeVisible({ timeout: 10_000 })

  // Sales Manager gets no status/notes control at all — PC is the sole
  // stage-status writer.
  await expect(page.locator('select').filter({ has: page.locator('option', { hasText: 'Mark completed' }) })).toHaveCount(0)

  await page.reload()
  await expandStage(page, 'Machine manufacturing progress')
  await expect(page.getByText('01/15/2026').or(page.getByText('2026-01-15'))).toBeVisible()

  await page.click('text=Log out')
  await expect(page).toHaveURL('/login', { timeout: 10_000 })

  // PC still has both controls.
  await login(page, 'pia@businesslinks-pk.com', 'Password123!')
  await page.goto('/orders/1')
  await expandStage(page, 'Machine manufacturing progress')
  await expect(page.locator('select').filter({ has: page.locator('option', { hasText: 'Mark completed' }) })).toHaveCount(1)
})

test('Sales Manager and PC can create and manage their project\'s customer login', async ({ page }) => {
  await login(page, 'sana@businesslinks-pk.com', 'Password123!')
  await page.goto('/projects/1')

  const panel = page.locator('h2', { hasText: 'Customer login' }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
  await expect(panel).toBeVisible()

  // external-role-redaction.spec.ts, which runs earlier against this same
  // shared project-1 fixture, may already have created its customer login
  // — handle both the "none yet" and "one already exists" states rather
  // than assuming which one this run starts from.
  const createNameInput = panel.locator('input[placeholder="Customer contact name"]')
  if (await createNameInput.isVisible().catch(() => false)) {
    await createNameInput.fill('Textile Mills Contact')
    await panel.locator('input[placeholder="Customer email"]').fill('sat-approver@textilemills.example')
    await panel.locator('button:has-text("Create login")').click()
    await expect(panel.locator('text=Temporary password:')).toBeVisible({ timeout: 10_000 })
  }

  await expect(panel.locator('button:has-text("Reset password")')).toBeVisible({ timeout: 10_000 })
  await panel.locator('button:has-text("Reset password")').click()
  await expect(panel.locator('text=Temporary password:')).toBeVisible({ timeout: 10_000 })
  const firstPassword = await panel.locator('code').innerText()

  await page.click('text=Log out')
  await expect(page).toHaveURL('/login', { timeout: 10_000 })

  // PC sees the same login (not a duplicate create form) and can reset it too.
  await login(page, 'pia@businesslinks-pk.com', 'Password123!')
  await page.goto('/projects/1')
  const pcPanel = page.locator('h2', { hasText: 'Customer login' }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
  await expect(pcPanel.locator('button:has-text("Reset password")')).toBeVisible({ timeout: 10_000 })
  const customerEmail = await pcPanel.locator('p.text-xs.text-slate-500').innerText()
  await pcPanel.locator('button:has-text("Reset password")').click()
  await expect(pcPanel.locator('text=Temporary password:')).toBeVisible({ timeout: 10_000 })
  const secondPassword = await pcPanel.locator('code').innerText()
  expect(secondPassword).not.toBe(firstPassword)

  // The reset login actually works and reaches this project's order.
  await page.click('text=Log out')
  await expect(page).toHaveURL('/login', { timeout: 10_000 })
  await login(page, customerEmail, secondPassword)
  await page.goto('/orders/1')
  await expect(page.locator('text=ORD-0001')).toBeVisible({ timeout: 10_000 })
})

/**
 * Live feedback: the Owner's Manage-users table showed a Customer row's
 * role but never which project they were scoped to, and there was no way
 * to fix a wrong assignment short of a direct database edit — "the
 * Project assigned needs to be mentioned or can be updated (both from
 * owner and Sales manager account)." PC deliberately excluded here,
 * unlike create/reset-password above — only Owner and Sales Manager were
 * named for this one.
 */
test('Sales Manager can move a project\'s customer login to a different project', async ({ page }) => {
  await login(page, 'sana@businesslinks-pk.com', 'Password123!')

  // Two brand-new projects, both created within this test — deliberately
  // not reusing the shared PRJ-0001 fixture, since other specs sharing it
  // may already have given it more than one customer login (nothing in
  // this system enforces "exactly one customer per project"), which would
  // make "back to the create form after moving the customer away" a false
  // assumption if a second, unrelated customer were still on it.
  async function createProject(number: string, title: string): Promise<string> {
    await page.goto('/projects')
    await page.fill('input[placeholder="Project number (e.g. PRJ-0007)"]', number)
    await page.fill('input[placeholder="Customer name"]', 'Reassignment Test Co')
    await page.fill('input[placeholder="Title"]', title)
    await page.locator('select').nth(0).selectOption({ label: 'Sana Sales (sana@businesslinks-pk.com)' })
    await page.locator('select').nth(1).selectOption({ label: 'Pia Coordinator (pia@businesslinks-pk.com)' })
    await page.click('button:has-text("Create project")')
    await expect(page.locator(`text=${number}`)).toBeVisible({ timeout: 10_000 })
    await page.click(`text=${number}`)
    await expect(page).toHaveURL(/\/projects\/\d+$/)
    return page.url()
  }

  const sourceProjectUrl = await createProject('PRJ-MOVE-SRC', 'Reassignment source project')
  const targetProjectUrl = await createProject('PRJ-MOVE-DST', 'Reassignment target project')

  // A fresh customer login on the source project — guaranteed to be the
  // only one there, since the project itself is brand new.
  await page.goto(sourceProjectUrl)
  const panel = page.locator('h2', { hasText: 'Customer login' }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
  await panel.locator('input[placeholder="Customer contact name"]').fill('Reassign Test Contact')
  await panel.locator('input[placeholder="Customer email"]').fill('reassign-test-fresh@textilemills.example')
  await panel.locator('button:has-text("Create login")').click()
  await expect(panel.locator('text=Temporary password:')).toBeVisible({ timeout: 10_000 })

  // Move it to the target project.
  await panel.locator('select').selectOption({ label: 'PRJ-MOVE-DST · Reassignment target project' })
  await panel.locator('button:has-text("Move")').click()

  // Gone from the source project — back to the create form.
  await expect(panel.locator('input[placeholder="Customer contact name"]')).toBeVisible({ timeout: 10_000 })

  // Now shows on the target project instead.
  await page.goto(targetProjectUrl)
  const newPanel = page.locator('h2', { hasText: 'Customer login' }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
  await expect(newPanel.getByText('reassign-test-fresh@textilemills.example', { exact: true })).toBeVisible({ timeout: 10_000 })
})
