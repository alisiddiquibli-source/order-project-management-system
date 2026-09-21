import { writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

/**
 * Drives one order through every one of the 12 pipeline stages, creation
 * to handover, using the same roles/logins a real deal actually needs
 * (Sales Manager creates the order, PC runs the day-to-day evidence,
 * Installation Engineer submits stages 9-12, a real Customer login
 * records acceptances). Written after live testing on production reported
 * "the system does not move forward after Requirements captured" — this
 * either reproduces that (and the fix should make it pass) or proves the
 * mechanics work end to end once the plain-English blocking messages
 * (StageCompletionEvaluator) are in place.
 */

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL('/', { timeout: 10_000 })
}

async function logout(page: Page) {
  await page.click('text=Log out')
  await expect(page).toHaveURL('/login', { timeout: 10_000 })
}

async function expandStage(page: Page, stageName: string) {
  // Click once, then wait (don't retry the click itself — it's a toggle,
  // so retrying on a slow-but-successful expansion collapses it right
  // back, which is its own bug rather than a fix for flakiness).
  await page.waitForLoadState('networkidle')
  const header = page.locator('button', { hasText: stageName }).first()
  await header.waitFor({ state: 'visible' })
  await header.click()
  await expect(page.locator('h3', { hasText: /./ }).first()).toBeVisible({ timeout: 10_000 })
}

async function markStageComplete(page: Page, note?: string) {
  // StageUpdateForm specifically — several other forms on this page also
  // have a "Save"/"Save changes" button (OrderEditForm, target-handover-date).
  const form = page.locator('select').filter({ has: page.locator('option', { hasText: 'Change status' }) }).locator('xpath=ancestor::div[contains(@class,"bg-slate-50")][1]')
  if (note) {
    await form.locator('input[placeholder*="Add a note"]').fill(note)
  }
  await form.locator('select').selectOption({ label: 'Mark completed' })
  await form.locator('button:has-text("Save")').click()
}

test('full order lifecycle: creation through handover, using Sales Manager + PC + Engineer + real Customer logins', async ({ page }) => {
  test.setTimeout(180_000)

  // --- Owner creates a Customer login scoped to the fixture project, so
  // acceptances at stages 5/10/11/12 can be recorded by an actual customer. ---
  await login(page, 'owen@businesslinks-pk.com', 'Password123!')
  await page.goto('/users')
  // Scoped to the "Create a login" form specifically — each existing user
  // row also has its own project-reassignment <select> (with the same
  // "PRJ-0001" option text) since the Manage-users Project column was added.
  const createForm = page.locator('h2', { hasText: 'Create a login' }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
  await createForm.locator('input[placeholder="Full name"]').fill('Lifecycle Test Customer')
  await createForm.locator('input[placeholder="Email"]').fill('lifecycle-customer@textilemills.example')
  await createForm.locator('select').first().selectOption({ label: 'Customer' })
  await createForm.locator('select').filter({ has: page.locator('option', { hasText: 'PRJ-0001' }) }).selectOption({ label: 'PRJ-0001 · New spinning line' })
  await createForm.locator('button:has-text("Create")').click()
  const banner = page.locator('text=Temporary password for').locator('xpath=ancestor::div[contains(@class,"justify-between")][1]')
  await expect(banner).toBeVisible({ timeout: 10_000 })
  const customerPassword = await banner.locator('code').innerText()
  await logout(page)

  // --- Sales Manager creates the order itself (task: SM should be able to). ---
  await login(page, 'sana@businesslinks-pk.com', 'Password123!')
  await page.goto('/projects/1')
  const orderForm = page.locator('h2:has-text("Add a machine")').locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
  await expect(orderForm).toBeVisible()
  await orderForm.locator('input[placeholder*="Order number"]').fill('ORD-LIFECYCLE01')
  await orderForm.locator('input[placeholder="Machine name"]').fill('Lifecycle Test Machine')
  await orderForm.locator('select').nth(0).selectOption({ label: 'Acme Machines GmbH' })
  await orderForm.locator('select').nth(1).selectOption({ label: 'Eng Engineer (eng@businesslinks-pk.com)' })
  await orderForm.locator('input[title="Start date"]').fill('2026-01-01')
  await orderForm.locator('input[title="Target handover date"]').fill('2026-06-01')
  await orderForm.locator('button:has-text("Create order")').click()
  await expect(page.locator('text=ORD-LIFECYCLE01')).toBeVisible({ timeout: 10_000 })
  await page.click('text=ORD-LIFECYCLE01')
  await expect(page).toHaveURL(/\/orders\/\d+$/)
  const orderUrl = page.url()
  await logout(page)

  // --- PC drives stages 1-8. ---
  await login(page, 'pia@businesslinks-pk.com', 'Password123!')
  await page.goto(orderUrl)

  // Stage 1: Requirements captured.
  await expandStage(page, 'Requirements captured')
  await page.fill('input[placeholder="Describe a requirement…"]', 'Machine must run on 3-phase 50Hz supply')
  await page.click('button:has-text("Add")')
  await expect(page.locator('text=Pending approval')).toBeVisible({ timeout: 10_000 })
  await logout(page)

  await login(page, 'sana@businesslinks-pk.com', 'Password123!')
  await page.goto(orderUrl)
  await expandStage(page, 'Requirements captured')
  await page.click('button:has-text("Approve")')
  await expect(page.getByText('Approved', { exact: true })).toBeVisible({ timeout: 10_000 })
  await logout(page)

  await login(page, 'pia@businesslinks-pk.com', 'Password123!')
  await page.goto(orderUrl)
  await expandStage(page, 'Requirements captured')
  // URS document required (or an Owner exemption) before this stage can
  // complete — production feedback: "special focus on URS, presence, URS
  // acceptance (must)."
  const ursFile = '/tmp/e2e-urs.pdf'
  writeFileSync(ursFile, Buffer.from('fake URS content'))
  const ursDocs = page.locator('h3', { hasText: 'Documents (URS required' }).locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]')
  await ursDocs.locator('input[type="file"]').setInputFiles(ursFile)
  await ursDocs.locator('button:has-text("Upload")').click()
  await expect(ursDocs.getByText('URS', { exact: true })).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('text=URS document on file.')).toBeVisible({ timeout: 10_000 })
  await markStageComplete(page)
  await expect(page.locator('text=Could not').first()).toHaveCount(0)

  // Stage 2: Order placed — upload a PO document and an LC document
  // ("LC documents to be uploaded along with Purchase order").
  await page.goto(orderUrl)
  await expandStage(page, 'Order placed')
  const poFile = '/tmp/e2e-po.pdf'
  writeFileSync(poFile, Buffer.from('fake PO content'))
  const stage2Docs = page.locator('h3', { hasText: 'Documents (a PO is required)' }).locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]')
  await stage2Docs.locator('input[type="file"]').setInputFiles(poFile)
  await stage2Docs.locator('button:has-text("Upload")').click()
  await expect(stage2Docs.getByText('PO', { exact: true })).toBeVisible({ timeout: 10_000 })

  const lcFile = '/tmp/e2e-lc.pdf'
  writeFileSync(lcFile, Buffer.from('fake LC content'))
  const lcDocs = page.locator('h3', { hasText: 'Documents (an LC is required)' }).locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]')
  await lcDocs.locator('input[type="file"]').setInputFiles(lcFile)
  await lcDocs.locator('button:has-text("Upload")').click()
  await expect(lcDocs.getByText('LC', { exact: true })).toBeVisible({ timeout: 10_000 })
  await markStageComplete(page)

  // Stage 3: Machine manufacturing progress — one milestone, marked done.
  await page.goto(orderUrl)
  await expandStage(page, 'Machine manufacturing progress')
  await page.fill('input[placeholder="Add a milestone…"]', 'Frame assembly')
  await page.click('button:has-text("Add")')
  await expect(page.locator('text=Frame assembly')).toBeVisible({ timeout: 10_000 })
  await page.locator('input[type="checkbox"]').first().click()
  await expect(page.locator('input[type="checkbox"]').first()).toBeChecked({ timeout: 10_000 })
  await markStageComplete(page)

  // Stage 4: Testing material coordination — completed with a confirming note.
  await page.goto(orderUrl)
  await expandStage(page, 'Machine testing material coordination')
  await markStageComplete(page, 'Test weights and calibration tools confirmed on site')

  // Stage 5: FAT — schedule, record a straight Pass (no acceptance needed for a plain pass),
  // plus IQ/OQ/DQ soft copies from the Supplier ("we need IQ, OQ, and DQ documents").
  await page.goto(orderUrl)
  await expandStage(page, 'Machine FAT readiness')
  await page.click('button:has-text("Schedule FAT")')
  await page.locator('select', { hasText: 'Record result' }).selectOption({ label: 'Pass' })
  await page.click('button:has-text("Record result")')
  await expect(page.locator('text=Result: pass')).toBeVisible({ timeout: 10_000 })
  for (const docType of ['IQ', 'OQ', 'DQ']) {
    const filePath = `/tmp/e2e-${docType.toLowerCase()}.pdf`
    writeFileSync(filePath, Buffer.from(`fake ${docType} content`))
    const docsSection = page.locator('h3', { hasText: `${docType} document (from Supplier)` }).locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]')
    await docsSection.locator('input[type="file"]').setInputFiles(filePath)
    await docsSection.locator('button:has-text("Upload")').click()
    await expect(docsSection.getByText(docType, { exact: true })).toBeVisible({ timeout: 10_000 })
  }
  await markStageComplete(page)

  // Stage 6: Shipment — book, mark dispatched, and attach shipping document
  // copies ("we need shipping document copies").
  await page.goto(orderUrl)
  await expandStage(page, 'Shipment coordination')
  await page.fill('input[placeholder="Carrier"]', 'Maersk')
  await page.click('button:has-text("Book shipment")')
  await expect(page.locator('text=Maersk')).toBeVisible({ timeout: 10_000 })
  await page.click('button:has-text("Mark dispatched today")')
  await expect(page.locator('text=Dispatched')).toBeVisible({ timeout: 10_000 })
  const shippingFile = '/tmp/e2e-shipping-doc.pdf'
  writeFileSync(shippingFile, Buffer.from('fake shipping document content'))
  const shippingDocs = page.locator('h3', { hasText: 'Shipping documents' }).locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]')
  await shippingDocs.locator('input[type="file"]').setInputFiles(shippingFile)
  await shippingDocs.locator('button:has-text("Upload")').click()
  await expect(shippingDocs.getByText('shipping_document', { exact: true })).toBeVisible({ timeout: 10_000 })
  await markStageComplete(page)

  // Stage 7: Import clearance — start tracking with the coordinator's cell
  // phone and email on record ("Customer Contact Coordinator cell phone
  // and email"), then update to "cleared".
  await page.goto(orderUrl)
  await expandStage(page, 'Import clearance in Pakistan')
  await page.fill('input[placeholder="Customer contact name"]', 'Textile Mills Logistics')
  await page.fill('input[placeholder="Contact email"]', 'logistics@textilemills.example')
  await page.fill('input[placeholder="Contact cell phone"]', '+92-300-1234567')
  await page.click('button:has-text("Start tracking")')
  await expect(page.locator('text=Latest status:')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('text=Email: logistics@textilemills.example')).toBeVisible()
  await page.fill('input[placeholder*="New status"]', 'cleared')
  await page.click('button:has-text("Update")')
  await expect(page.locator('text=Latest status: cleared')).toBeVisible({ timeout: 10_000 })
  await markStageComplete(page)

  // Stage 8: Delivery — its own separate tracking record (stage
  // 7/8 each get their own customer_import_tracking row, keyed by
  // order_stage_id, not shared — confirmed by reading logistics.php; a PC
  // has to "start tracking" again here rather than the stage 7 record
  // just continuing, which is worth flagging as a workflow oddity even
  // though it isn't a bug this pass is meant to fix).
  await page.goto(orderUrl)
  await expandStage(page, 'Delivery to customer')
  await page.fill('input[placeholder="Customer contact name"]', 'Textile Mills Logistics')
  await page.fill('input[placeholder="Initial status (optional)"]', 'delivered')
  await page.click('button:has-text("Start tracking")')
  await expect(page.locator('text=Latest status: delivered')).toBeVisible({ timeout: 10_000 })
  await markStageComplete(page)
  await logout(page)

  // --- Installation Engineer drives stage 9's evidence; PC still owns status. ---
  await login(page, 'eng@businesslinks-pk.com', 'Password123!')
  await page.goto(orderUrl)
  await expandStage(page, 'Installation at customer site')
  await page.click('button:has-text("Submit report")')
  await expect(page.locator('text=Latest: complete')).toBeVisible({ timeout: 10_000 })
  await logout(page)

  await login(page, 'pia@businesslinks-pk.com', 'Password123!')
  await page.goto(orderUrl)
  await expandStage(page, 'Installation at customer site')
  await markStageComplete(page)
  await logout(page)

  // --- Stage 10: SAT — Engineer records the result, real Customer accepts. ---
  await login(page, 'eng@businesslinks-pk.com', 'Password123!')
  await page.goto(orderUrl)
  await expandStage(page, 'SAT (Site Acceptance Test)')
  await page.click('button:has-text("Schedule SAT")')
  await page.locator('select', { hasText: 'Record result' }).selectOption({ label: 'Pass' })
  await page.click('button:has-text("Record result")')
  await expect(page.locator('text=Result: pass')).toBeVisible({ timeout: 10_000 })
  await logout(page)

  // A Sales Manager provisionally accepts first (no customer-authorization
  // evidence attached yet) — the real-world sequence a live production
  // report was built around: "Accepted by a Sales Manager — Not yet
  // customer-confirmed" stuck on screen even after the customer accepted.
  // Root cause was AcceptanceSection picking acceptances[acceptances.length
  // - 1] as "latest", when the backend already returns them newest-first —
  // that grabbed the *first* acceptance ever recorded forever, not the
  // most recent one. Regression-tested here with two acceptances on the
  // same stage, which a single-acceptance flow can't catch.
  await login(page, 'sana@businesslinks-pk.com', 'Password123!')
  await page.goto(orderUrl)
  await expandStage(page, 'SAT (Site Acceptance Test)')
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  await expect(page.locator('text=Not yet customer-confirmed')).toBeVisible({ timeout: 10_000 })
  await logout(page)

  await login(page, 'lifecycle-customer@textilemills.example', customerPassword)
  await page.goto(orderUrl)
  await expandStage(page, 'SAT (Site Acceptance Test)')
  await expect(page.locator('text=Accepted by a Sales Manager')).toBeVisible({ timeout: 10_000 })
  // Exact match, not has-text: "Accept" is also a substring of "Site
  // Acceptance Test", which matches this stage's own collapse/expand
  // header button and would toggle it shut instead of clicking Accept.
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  await expect(page.locator('text=Genuine customer acceptance')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('text=Accepted by the customer')).toBeVisible()
  await logout(page)

  await login(page, 'pia@businesslinks-pk.com', 'Password123!')
  await page.goto(orderUrl)
  await expandStage(page, 'SAT (Site Acceptance Test)')
  await markStageComplete(page)
  await logout(page)

  // --- Stage 11: Training — Engineer records it, Customer acknowledges. ---
  await login(page, 'eng@businesslinks-pk.com', 'Password123!')
  await page.goto(orderUrl)
  await expandStage(page, 'Training')
  await page.fill('input[placeholder="Attendees"]', 'Plant supervisor, 2 operators')
  await page.click('button:has-text("Submit training record")')
  await expect(page.locator('text=Attendees: Plant supervisor')).toBeVisible({ timeout: 10_000 })
  // Structured customer staff detail required before this stage can
  // complete ("Customer staff details like Department, Designation, and
  // contact numbers email and cell").
  await page.fill('input[placeholder="Name"]', 'Zainab Malik')
  await page.fill('input[placeholder="Department"]', 'Production')
  await page.fill('input[placeholder="Designation"]', 'Shift Supervisor')
  await page.fill('input[placeholder="Cell phone"]', '+92-300-7654321')
  await page.fill('input[placeholder="Email"]', 'zainab.malik@textilemills.example')
  await page.click('button:has-text("Add")')
  await expect(page.locator('text=Zainab Malik')).toBeVisible({ timeout: 10_000 })
  await logout(page)

  await login(page, 'lifecycle-customer@textilemills.example', customerPassword)
  await page.goto(orderUrl)
  await expandStage(page, 'Training')
  // Exact match, not has-text: "Accept" is also a substring of "Site
  // Acceptance Test", which matches this stage's own collapse/expand
  // header button and would toggle it shut instead of clicking Accept.
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  await expect(page.locator('text=Genuine customer acceptance')).toBeVisible({ timeout: 10_000 })
  await logout(page)

  await login(page, 'pia@businesslinks-pk.com', 'Password123!')
  await page.goto(orderUrl)
  await expandStage(page, 'Training')
  await markStageComplete(page)
  await logout(page)

  // --- Stage 12: Handover — Engineer readiness report, PC uploads the
  // certificate, Customer confirms handover. ---
  await login(page, 'eng@businesslinks-pk.com', 'Password123!')
  await page.goto(orderUrl)
  await expandStage(page, 'Handover')
  await page.click('button:has-text("Submit report")')
  await expect(page.locator('text=Latest: complete')).toBeVisible({ timeout: 10_000 })
  await logout(page)

  await login(page, 'pia@businesslinks-pk.com', 'Password123!')
  await page.goto(orderUrl)
  await expandStage(page, 'Handover')
  const certFile = '/tmp/e2e-handover-cert.pdf'
  writeFileSync(certFile, Buffer.from('fake handover certificate'))
  const handoverDocs = page.locator('h3', { hasText: 'Handover certificate' }).locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]')
  await handoverDocs.locator('input[type="file"]').setInputFiles(certFile)
  await handoverDocs.locator('button:has-text("Upload")').click()
  await expect(handoverDocs.locator('text=handover_certificate')).toBeVisible({ timeout: 10_000 })
  await logout(page)

  await login(page, 'lifecycle-customer@textilemills.example', customerPassword)
  await page.goto(orderUrl)
  await expandStage(page, 'Handover')
  // Exact match, not has-text: "Accept" is also a substring of "Site
  // Acceptance Test", which matches this stage's own collapse/expand
  // header button and would toggle it shut instead of clicking Accept.
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  await expect(page.locator('text=Genuine customer acceptance')).toBeVisible({ timeout: 10_000 })
  await logout(page)

  await login(page, 'pia@businesslinks-pk.com', 'Password123!')
  await page.goto(orderUrl)
  await expandStage(page, 'Handover')
  await markStageComplete(page)

  // The pipeline flowchart should now report the order fully handed over.
  await page.goto(orderUrl)
  await expect(page.locator('text=All 12 stages complete')).toBeVisible({ timeout: 10_000 })
})
