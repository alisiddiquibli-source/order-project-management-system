import { expect, test } from '@playwright/test'

test('PC adds an external link (e.g. a YouTube walkthrough video) as a stage document', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', 'pia@businesslinks-pk.com')
  await page.fill('input[type="password"]', 'Password123!')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL('/', { timeout: 10_000 })

  await page.goto('/orders/1')
  // Stage 2's plain DocumentsSection (a PO is required) — deliberately not
  // the FAT/SAT one, which fatsat-documents.spec.ts drives through its own
  // one-time "Schedule FAT" action on this same shared order/stage.
  await page.locator('button', { hasText: 'Order placed' }).first().click()
  await expect(page.locator('text=Documents (a PO is required)')).toBeVisible()

  const documentsSection = page.locator('h3', { hasText: 'Documents (a PO is required)' }).locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]')
  await documentsSection.locator('input[placeholder="Document type"]').fill('fat_video')
  await documentsSection.locator('input[type="url"]').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  await documentsSection.locator('button:has-text("Add link")').click()

  await expect(documentsSection.locator('text=fat_video')).toBeVisible({ timeout: 10_000 })
  await expect(documentsSection.locator('a:has-text("Open link")')).toHaveAttribute('href', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
})

test('Sales Manager adds a link as general project media', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', 'sana@businesslinks-pk.com')
  await page.fill('input[type="password"]', 'Password123!')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL('/', { timeout: 10_000 })

  await page.goto('/projects/1/media')
  const mediaForm = page.locator('h2:has-text("Add project media")').locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
  await mediaForm.locator('input[placeholder*="site_survey"]').fill('site_walkthrough_video')
  await mediaForm.locator('input[type="url"]').fill('https://www.youtube.com/watch?v=abc123')
  await mediaForm.locator('button:has-text("Add link")').click()

  const card = page.locator('text=site_walkthrough_video').locator('xpath=ancestor::div[contains(@class,"overflow-hidden")][1]')
  await expect(card).toBeVisible({ timeout: 10_000 })
  await expect(card.locator('a:has-text("Open link")')).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abc123')
})
