import { expect, test } from '@playwright/test'

test('logs in with valid credentials and reaches a role dashboard', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', 'pia@businesslinks-pk.com')
  await page.fill('input[type="password"]', 'Password123!')
  await page.click('button[type="submit"]')

  await expect(page).toHaveURL('/', { timeout: 10_000 })
  await expect(page.locator('text=My Orders')).toBeVisible()
})

test('rejects an invalid password with a visible error', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', 'pia@businesslinks-pk.com')
  await page.fill('input[type="password"]', 'wrong-password')
  await page.click('button[type="submit"]')

  await expect(page.locator('text=Invalid email or password.')).toBeVisible({ timeout: 10_000 })
  await expect(page).toHaveURL(/\/login/)
})
