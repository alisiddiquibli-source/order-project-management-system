import { expect, test } from '@playwright/test'

test('installation engineer creates an AMC contract, schedules a visit, and marks it visited', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', 'eng@businesslinks-pk.com')
  await page.fill('input[type="password"]', 'Password123!')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL('/', { timeout: 10_000 })

  await page.goto('/orders/1')
  await expect(page.locator('text=AMC contracts')).toBeVisible()

  const createFormDates = page.locator('input[type="date"]')
  await createFormDates.nth(0).fill('2026-10-01')
  await createFormDates.nth(1).fill('2027-10-01')
  await page.click('button:has-text("Create contract")')

  const contractRow = page.locator('text=2026-10-01').locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]')
  await expect(contractRow).toContainText('quarterly')

  await contractRow.locator('input[type="date"]').fill('2026-11-01')
  await contractRow.locator('button:has-text("Schedule visit")').click()
  await expect(contractRow.locator('text=Scheduled 2026-11-01')).toBeVisible()

  await contractRow.locator('button:has-text("Mark visited today")').click()
  await expect(contractRow.locator('text=Visited')).toBeVisible()
})
