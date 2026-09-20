import { writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

test('PC uploads project-level photo and video media and sees them in the feed', async ({ page }) => {
  const photoPath = '/tmp/e2e-project-photo.jpg'
  const videoPath = '/tmp/e2e-project-video.mp4'
  writeFileSync(photoPath, Buffer.from('fake jpeg content for e2e test'))
  writeFileSync(videoPath, Buffer.from('fake mp4 content for e2e test'))

  await page.goto('/login')
  await page.fill('input[type="email"]', 'pia@businesslinks-pk.com')
  await page.fill('input[type="password"]', 'Password123!')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL('/', { timeout: 10_000 })

  await page.goto('/projects')
  // Other e2e specs create/delete their own projects against this same
  // shared dev server, so scope to this fixture's row specifically rather
  // than assuming it's the only project in the list.
  const projectRow = page.locator('text=PRJ-0001').locator('xpath=ancestor::div[contains(@class,"justify-between")][1]')
  await projectRow.locator('a:has-text("Media")').click()
  await expect(page).toHaveURL(/\/projects\/1\/media/)
  await expect(page.locator('text=PRJ-0001')).toBeVisible()

  // Upload a photo.
  await page.fill('input[placeholder*="site_survey"]', 'site_survey')
  await page.locator('input[type="file"]').setInputFiles(photoPath)
  await page.click('button:has-text("Upload")')
  await expect(page.locator('text=site_survey')).toBeVisible()
  await expect(page.locator('img[alt="site_survey"]')).toBeVisible({ timeout: 10_000 })

  // Upload a video.
  await page.fill('input[placeholder*="site_survey"]', 'walkthrough_video')
  await page.locator('input[type="file"]').setInputFiles(videoPath)
  await page.click('button:has-text("Upload")')
  await expect(page.locator('text=walkthrough_video')).toBeVisible()
  await expect(page.locator('video')).toHaveCount(1, { timeout: 10_000 })

  // Both new cards show a Download link (local storage, not Drive) — scoped
  // to each card specifically, since this feed also includes documents
  // other specs attach to this same project's orders (e.g. fatsat-documents.spec.ts).
  const photoCard = page.locator('text=site_survey').locator('xpath=ancestor::div[contains(@class,"overflow-hidden")][1]')
  const videoCard = page.locator('text=walkthrough_video').locator('xpath=ancestor::div[contains(@class,"overflow-hidden")][1]')
  await expect(photoCard.locator('button:has-text("Download")')).toHaveCount(1)
  await expect(videoCard.locator('button:has-text("Download")')).toHaveCount(1)
})
