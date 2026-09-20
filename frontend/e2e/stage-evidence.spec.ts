import { expect, test } from '@playwright/test'

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL('/', { timeout: 10_000 })
}

async function expandStage(page: import('@playwright/test').Page, stageName: string) {
  await page.locator('button', { hasText: stageName }).first().click()
}

test('PC books a shipment and marks it dispatched (stage 6)', async ({ page }) => {
  await login(page, 'pia@businesslinks-pk.com', 'Password123!')
  await page.goto('/orders/1')
  await expect(page.locator('text=ORD-0001')).toBeVisible()

  await expandStage(page, 'Shipment coordination')
  await expect(page.locator('h3', { hasText: 'Shipment' })).toBeVisible()

  await page.fill('input[placeholder="Carrier"]', 'Maersk Line')
  const dateInputs = page.locator('input[type="date"]')
  await dateInputs.nth(0).fill('2026-10-01')
  await dateInputs.nth(1).fill('2026-10-25')
  await page.click('button:has-text("Book shipment")')

  await expect(page.locator('text=Maersk Line')).toBeVisible()

  await page.click('button:has-text("Mark dispatched today")')
  await expect(page.locator('text=Dispatched')).toBeVisible()
})

test('PC starts and progresses customer import tracking through clearance into delivery (stages 7-8)', async ({ page }) => {
  await login(page, 'pia@businesslinks-pk.com', 'Password123!')
  await page.goto('/orders/1')

  await expandStage(page, 'Import clearance in Pakistan')
  await expect(page.locator('text=Customer import tracking')).toBeVisible()

  await page.fill('input[placeholder="Customer contact name"]', 'Textile Mills Import Desk')
  await page.fill('input[placeholder="Initial status (optional)"]', 'in_transit')
  await page.click('button:has-text("Start tracking")')
  await expect(page.locator('text=Latest status: in_transit')).toBeVisible()

  await page.fill('input[placeholder^="New status"]', 'cleared')
  await page.click('button:has-text("Update")')
  await expect(page.locator('text=Latest status: cleared')).toBeVisible()

  // Stage 8 has its own separate tracking record (scoped per order_stage,
  // not per order) and shows delivery documents alongside it.
  await expandStage(page, 'Delivery to customer')
  await expect(page.locator('text=Customer import tracking')).toBeVisible()
  await expect(page.locator('text=No tracking record yet.')).toBeVisible()
  await expect(page.locator('text=Delivery documents')).toBeVisible()
})
