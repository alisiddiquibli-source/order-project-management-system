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
