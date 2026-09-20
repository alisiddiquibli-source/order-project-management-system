import { expect, test } from '@playwright/test'

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL('/', { timeout: 10_000 })
}

/**
 * A supplier/customer login is only useful tied to the company/project it's
 * for (visibility everywhere keys off supplier_id/scope_project_id) — this
 * covers the create form's conditional pickers and the backend validation
 * that a login can't be created without one.
 */
test.describe('creating supplier/customer logins requires the right reference', () => {
  test('a Supplier login requires picking (or adding) a supplier company', async ({ page }) => {
    await login(page, 'owen@businesslinks-pk.com', 'Password123!')
    await page.goto('/users')

    await page.fill('input[placeholder="Full name"]', 'Acme Contact')
    await page.fill('input[placeholder="Email"]', 'contact@acme-machines.example')
    await page.locator('select').first().selectOption({ label: 'Supplier' })

    const createButton = page.locator('button:has-text("Create")').first()
    await expect(createButton).toBeDisabled()

    await page.locator('select').filter({ has: page.locator('option', { hasText: 'Acme Machines GmbH' }) }).selectOption({ label: 'Acme Machines GmbH' })
    await expect(createButton).toBeEnabled()
    await createButton.click()

    const supplierBanner = page.locator('text=Temporary password for').locator('xpath=ancestor::div[contains(@class,"justify-between")][1]')
    await expect(supplierBanner).toBeVisible({ timeout: 10_000 })
    await expect(supplierBanner.locator('strong')).toHaveText('contact@acme-machines.example')
  })

  test('a Customer login requires picking the project they can see', async ({ page }) => {
    await login(page, 'owen@businesslinks-pk.com', 'Password123!')
    await page.goto('/users')

    await page.fill('input[placeholder="Full name"]', 'Textile Mills Contact')
    await page.fill('input[placeholder="Email"]', 'ops@textilemills.example')
    await page.locator('select').first().selectOption({ label: 'Customer' })

    const createButton = page.locator('button:has-text("Create")').first()
    await expect(createButton).toBeDisabled()

    await page.locator('select').filter({ has: page.locator('option', { hasText: 'PRJ-0001' }) }).selectOption({ label: 'PRJ-0001 · New spinning line' })
    await expect(createButton).toBeEnabled()
    await createButton.click()

    const customerBanner = page.locator('text=Temporary password for').locator('xpath=ancestor::div[contains(@class,"justify-between")][1]')
    await expect(customerBanner).toBeVisible({ timeout: 10_000 })
    await expect(customerBanner.locator('strong')).toHaveText('ops@textilemills.example')
  })
})
