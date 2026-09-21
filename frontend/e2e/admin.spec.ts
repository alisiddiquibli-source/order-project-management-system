import { expect, test } from '@playwright/test'

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL('/', { timeout: 10_000 })
}

test.describe('account administration (§7.1)', () => {
  test('owner creates, resets, deactivates, and reactivates a login', async ({ page }) => {
    await login(page, 'owen@businesslinks-pk.com', 'Password123!')
    await page.goto('/users')
    await expect(page.locator('text=Create a login')).toBeVisible()

    await page.fill('input[placeholder="Full name"]', 'Nadia New Hire')
    await page.fill('input[placeholder="Email"]', 'nadia@businesslinks-pk.com')
    await page.selectOption('select >> nth=0', { label: 'Import Manager' })
    await page.click('button:has-text("Create")')

    const row = page.locator('tr', { hasText: 'Nadia New Hire' })
    await expect(row).toBeVisible()
    await expect(page.locator('text=Temporary password for')).toBeVisible()
    await expect(page.locator('strong', { hasText: 'nadia@businesslinks-pk.com' })).toBeVisible()

    await row.locator('button:has-text("Reset password")').click()
    await expect(page.locator('text=Temporary password for')).toBeVisible()
    await expect(page.locator('strong', { hasText: 'nadia@businesslinks-pk.com' })).toBeVisible()

    await row.locator('button:has-text("Deactivate")').click()
    await expect(row.locator('text=inactive')).toBeVisible()
    await row.locator('button:has-text("Reactivate")').click()
    await expect(row.locator('text=active')).toBeVisible()
  })

  test('a non-@businesslinks-pk.com email is rejected for an internal role', async ({ page }) => {
    await login(page, 'owen@businesslinks-pk.com', 'Password123!')
    await page.goto('/users')

    await page.fill('input[placeholder="Full name"]', 'Bad Domain')
    await page.fill('input[placeholder="Email"]', 'bad@gmail.com')
    await page.selectOption('select >> nth=0', { label: 'Sales Manager' })
    await page.click('button:has-text("Create")')

    await expect(page.locator('text=must have a @businesslinks-pk.com email address')).toBeVisible()
  })

  test('owner can see and reassign a customer\'s project from Manage users', async ({ page }) => {
    await login(page, 'owen@businesslinks-pk.com', 'Password123!')

    // A second project to reassign into — distinct number from the other
    // fixtures/tests in this same file (PRJ-9001, PRJ-9002 are taken).
    await page.goto('/projects')
    await page.fill('input[placeholder="Project number (e.g. PRJ-0007)"]', 'PRJ-9003')
    await page.fill('input[placeholder="Customer name"]', 'Reassign Target Co')
    await page.fill('input[placeholder="Title"]', 'Reassignment target project')
    await page.locator('select').nth(0).selectOption({ label: 'Sana Sales (sana@businesslinks-pk.com)' })
    await page.locator('select').nth(1).selectOption({ label: 'Pia Coordinator (pia@businesslinks-pk.com)' })
    await page.click('button:has-text("Create project")')
    await expect(page.locator('text=PRJ-9003')).toBeVisible({ timeout: 10_000 })

    await page.goto('/users')
    await page.fill('input[placeholder="Full name"]', 'Owner Reassign Customer')
    await page.fill('input[placeholder="Email"]', 'owner-reassign-customer@textilemills.example')
    await page.locator('select').first().selectOption({ label: 'Customer' })
    await page.locator('select').filter({ has: page.locator('option', { hasText: 'PRJ-0001' }) }).selectOption({ label: 'PRJ-0001 · New spinning line' })
    await page.locator('button:has-text("Create")').first().click()

    const row = page.locator('tr', { hasText: 'Owner Reassign Customer' })
    await expect(row).toBeVisible({ timeout: 10_000 })
    // Column order: Name, Email, Role[select], Project[select], Status, Actions.
    const projectSelect = row.locator('select').nth(1)
    await expect(projectSelect).toHaveValue('1')

    await projectSelect.selectOption({ label: 'PRJ-9003 · Reassignment target project' })
    await expect(page.locator('text=Could not reassign')).toHaveCount(0)
    await expect(projectSelect).not.toHaveValue('1', { timeout: 10_000 })
  })

  test('a non-owner is redirected away from the user-management page', async ({ page }) => {
    await login(page, 'pia@businesslinks-pk.com', 'Password123!')
    await page.goto('/users')
    await expect(page).toHaveURL('/')
  })
})

test.describe('project creation and deletion', () => {
  test('a project coordinator can create a project but not delete it', async ({ page }) => {
    await login(page, 'pia@businesslinks-pk.com', 'Password123!')
    await page.goto('/projects')
    await expect(page.locator('text=Create a project')).toBeVisible()

    await page.fill('input[placeholder="Project number (e.g. PRJ-0007)"]', 'PRJ-9001')
    await page.fill('input[placeholder="Customer name"]', 'Textile Mills Ltd')
    await page.fill('input[placeholder="Title"]', 'New spinning line')
    await page.locator('select').nth(0).selectOption({ label: 'Sana Sales (sana@businesslinks-pk.com)' })
    await page.locator('select').nth(1).selectOption({ label: 'Pia Coordinator (pia@businesslinks-pk.com)' })
    await page.click('button:has-text("Create project")')

    await expect(page.locator('text=PRJ-9001')).toBeVisible()
    await expect(page.locator('button:has-text("Delete")')).toHaveCount(0)
  })

  test('the owner can delete a project with no orders attached', async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept())

    await login(page, 'owen@businesslinks-pk.com', 'Password123!')
    await page.goto('/projects')

    await page.fill('input[placeholder="Project number (e.g. PRJ-0007)"]', 'PRJ-9002')
    await page.fill('input[placeholder="Customer name"]', 'Textile Mills Ltd')
    await page.fill('input[placeholder="Title"]', 'Owner-created line')
    await page.locator('select').nth(0).selectOption({ label: 'Sana Sales (sana@businesslinks-pk.com)' })
    await page.locator('select').nth(1).selectOption({ label: 'Pia Coordinator (pia@businesslinks-pk.com)' })
    await page.click('button:has-text("Create project")')
    await expect(page.locator('text=PRJ-9002')).toBeVisible()

    const projectRow = page.locator('text=PRJ-9002').locator('xpath=ancestor::div[contains(@class,"justify-between")][1]')
    await projectRow.locator('button:has-text("Delete")').click()
    await expect(page.locator('text=PRJ-9002')).toHaveCount(0)
  })
})
