import { expect, test } from '@playwright/test'

test('Owner can create an order with dates left blank (placeholder dates used)', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', 'owen@businesslinks-pk.com')
  await page.fill('input[type="password"]', 'Password123!')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL('/', { timeout: 10_000 })

  await page.goto('/projects/1')
  const orderForm = page.locator('h2:has-text("Add a machine")').locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
  await expect(orderForm.locator('text=Dates are optional for you')).toBeVisible()

  await orderForm.locator('input[placeholder*="Order number"]').fill('ORD-NODATE01')
  await orderForm.locator('input[placeholder="Machine name"]').fill('No-date Loom')
  await orderForm.locator('select').nth(0).selectOption({ label: 'Acme Machines GmbH' })
  await orderForm.locator('select').nth(1).selectOption({ label: 'Eng Engineer (eng@businesslinks-pk.com)' })
  // Dates deliberately left blank.
  await orderForm.locator('button:has-text("Create order")').click()

  await expect(page.locator('text=ORD-NODATE01')).toBeVisible({ timeout: 10_000 })

  const today = new Date().toISOString().slice(0, 10)
  await expect(page.locator('text=No-date Loom').locator('xpath=ancestor::a[1]').locator(`text=${today}`)).toBeVisible()
})
