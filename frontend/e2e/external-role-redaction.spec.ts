import { expect, test } from '@playwright/test'

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL('/', { timeout: 10_000 })
}

/**
 * The order page's staffing row (Sales Manager/PC/Engineer/Supplier),
 * added when assignments were surfaced in the UI, was never vetted
 * against external logins — it rendered unconditionally, leaking BLI's
 * internal staff names to Customer/Supplier. Redacted both client- and
 * server-side (OrderRepository::redactForRole), matching how
 * contract_value/currency/customer_name are already handled for those roles.
 */
test('Customer and Supplier logins never see the internal staffing row', async ({ page }) => {
  await login(page, 'owen@businesslinks-pk.com', 'Password123!')
  await page.goto('/users')

  // Customer, scoped to the fixture project.
  await page.fill('input[placeholder="Full name"]', 'Redaction Test Customer')
  await page.fill('input[placeholder="Email"]', 'redaction-customer@textilemills.example')
  await page.locator('select').first().selectOption({ label: 'Customer' })
  await page.locator('select').filter({ has: page.locator('option', { hasText: 'PRJ-0001' }) }).selectOption({ label: 'PRJ-0001 · New spinning line' })
  await page.locator('button:has-text("Create")').first().click()
  const customerBanner = page.locator('text=Temporary password for').locator('xpath=ancestor::div[contains(@class,"justify-between")][1]')
  await expect(customerBanner).toBeVisible({ timeout: 10_000 })
  const customerPassword = await customerBanner.locator('code').innerText()
  await customerBanner.locator('button:has-text("Dismiss")').click()

  // Supplier, scoped to the fixture supplier company.
  await page.fill('input[placeholder="Full name"]', 'Redaction Test Supplier')
  await page.fill('input[placeholder="Email"]', 'redaction-supplier@acme-machines.example')
  await page.locator('select').first().selectOption({ label: 'Supplier' })
  await page.locator('select').filter({ has: page.locator('option', { hasText: 'Acme Machines GmbH' }) }).selectOption({ label: 'Acme Machines GmbH' })
  await page.locator('button:has-text("Create")').first().click()
  const supplierBanner = page.locator('text=Temporary password for').locator('xpath=ancestor::div[contains(@class,"justify-between")][1]')
  await expect(supplierBanner).toBeVisible({ timeout: 10_000 })
  const supplierPassword = await supplierBanner.locator('code').innerText()

  await page.click('text=Log out')
  await expect(page).toHaveURL('/login', { timeout: 10_000 })

  await login(page, 'redaction-customer@textilemills.example', customerPassword)
  await page.goto('/orders/1')
  await expect(page.locator('text=Sales Manager')).toHaveCount(0)
  await expect(page.locator('text=Sana Sales')).toHaveCount(0)
  await page.click('text=Log out')
  await expect(page).toHaveURL('/login', { timeout: 10_000 })

  await login(page, 'redaction-supplier@acme-machines.example', supplierPassword)
  await page.goto('/orders/1')
  await expect(page.locator('text=Project Coordinator')).toHaveCount(0)
  await expect(page.locator('text=Pia Coordinator')).toHaveCount(0)
  await page.click('text=Log out')
  await expect(page).toHaveURL('/login', { timeout: 10_000 })

  // An internal role still sees the row, unaffected.
  await login(page, 'pia@businesslinks-pk.com', 'Password123!')
  await page.goto('/orders/1')
  const staffingRow = page.locator('text=Sales Manager').locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
  await expect(staffingRow).toBeVisible()
  await expect(staffingRow.locator('text=Sana Sales')).toBeVisible()
})
