import { writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

test('PC uploads a FAT report and attaches it to the recorded result', async ({ page }) => {
  const filePath = '/tmp/e2e-fat-report.jpg'
  writeFileSync(filePath, Buffer.from('fake jpeg content for e2e test'))

  await page.goto('/login')
  await page.fill('input[type="email"]', 'pia@businesslinks-pk.com')
  await page.fill('input[type="password"]', 'Password123!')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL('/', { timeout: 10_000 })

  await page.goto('/orders/1')
  await page.locator('button', { hasText: 'Machine FAT readiness' }).first().click()
  await expect(page.locator('text=FAT report & photos')).toBeVisible()

  await page.click('button:has-text("Schedule FAT")')
  await expect(page.locator('text=FAT report & photos')).toBeVisible()

  // Upload a report through the newly-added DocumentsSection.
  await page.locator('input[type="file"]').setInputFiles(filePath)
  await page.click('button:has-text("Upload")')
  await expect(page.locator('text=fat_report')).toBeVisible()

  // The sibling FatSatSection's report-document picker must see the new
  // upload without a page reload (regression test for the cross-component
  // refresh fix — they're separate components with independent fetches).
  const reportPicker = page.locator('select', { hasText: 'No report document' })
  await expect(reportPicker.locator('option', { hasText: 'fat_report' })).toHaveCount(1)
  await reportPicker.selectOption({ label: 'fat_report' })

  await page.locator('select', { hasText: 'Record result' }).selectOption({ label: 'Pass' })
  await page.click('button:has-text("Record result")')
  await expect(page.locator('text=Result: pass')).toBeVisible()
})
