import { expect, test } from '@playwright/test'

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL('/', { timeout: 10_000 })
}

test('Owner can create an order directly (widened from PC-only)', async ({ page }) => {
  await login(page, 'owen@businesslinks-pk.com', 'Password123!')
  await page.goto('/projects/1')

  const orderForm = page.locator('h2:has-text("Add a machine")').locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
  await expect(orderForm).toBeVisible()

  await orderForm.locator('input[placeholder*="Order number"]').fill('ORD-OWNER01')
  await orderForm.locator('input[placeholder="Machine name"]').fill('Owner-created Loom')
  await orderForm.locator('select').nth(0).selectOption({ label: 'Acme Machines GmbH' })
  await orderForm.locator('select').nth(1).selectOption({ label: 'Eng Engineer (eng@businesslinks-pk.com)' })
  await orderForm.locator('input[title="Start date"]').fill('2026-01-01')
  await orderForm.locator('input[title="Target handover date"]').fill('2026-06-01')
  await orderForm.locator('button:has-text("Create order")').click()

  await expect(page.locator('text=ORD-OWNER01')).toBeVisible({ timeout: 10_000 })
})

test('PC edits an existing order and requests a target handover date change', async ({ page }) => {
  await login(page, 'pia@businesslinks-pk.com', 'Password123!')
  await page.goto('/orders/1')

  const editForm = page.locator('h3:has-text("Edit order details")').locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
  await expect(editForm).toBeVisible()

  await editForm.locator('input[placeholder="Machine name"]').fill('Ring Spinning Frame RS-200 Mk2')
  await editForm.locator('button:has-text("Save changes")').click()
  await expect(editForm.locator('text=Saved.')).toBeVisible({ timeout: 10_000 })

  await expect(page.locator('text=ORD-0001 · Ring Spinning Frame RS-200 Mk2')).toBeVisible()

  const dateForm = page.locator('h4:has-text("Change target handover date")').locator('xpath=ancestor::div[contains(@class,"border-t")][1]')
  await dateForm.locator('input[type="date"]').fill('2026-08-15')
  await dateForm.locator('input[placeholder*="Reason"]').fill('Supplier confirmed a later ex-works date')
  await dateForm.locator('select').selectOption({ label: 'Sana Sales (sana@businesslinks-pk.com)' })
  await dateForm.locator('button:has-text("Save")').click()

  await expect(dateForm.locator('text=Target handover date updated.')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('text=2026-08-15')).toBeVisible()
})

test('Sales Manager can reassign PC/Engineer and the start date, but not machine details', async ({ page }) => {
  await login(page, 'sana@businesslinks-pk.com', 'Password123!')
  await page.goto('/orders/1')

  const editForm = page.locator('h3:has-text("Edit order details")').locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
  await expect(editForm).toBeVisible()

  // Sales Manager's slice is narrower — no machine name/spec/supplier
  // fields at all, only PC/Engineer/start date.
  await expect(editForm.locator('input[placeholder="Machine name"]')).toHaveCount(0)

  await editForm.locator('select').nth(1).selectOption({ label: 'Eng Engineer (eng@businesslinks-pk.com)' })
  await editForm.locator('input[title="Start date"]').fill('2026-02-01')
  await editForm.locator('button:has-text("Save changes")').click()
  await expect(editForm.locator('text=Saved.')).toBeVisible({ timeout: 10_000 })
})
