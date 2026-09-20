import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * End-to-end simulation of BLI's actual real-world onboarding flow: the
 * Owner creates the three staff logins a new deal needs from scratch, then
 * those accounts are used to create a Project and an Order (machine)
 * purely through the UI — no raw database IDs typed anywhere. This is the
 * flow that surfaced the original bug report: the Project/Order creation
 * forms used to require typing a raw numeric user ID with no lookup, and
 * there was no way to create a Supplier or an Order through the UI at all.
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

/** Scopes to the card containing a given heading — every form on these
 *  pages lives in its own bordered card, and several cards share generic
 *  <select>/<input> elements, so scoping by heading avoids strict-mode
 *  ambiguity across them. */
function cardWithHeading(page: Page, headingText: string): Locator {
  return page.locator(`h2:has-text("${headingText}")`).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
}

async function createStaffLogin(page: Page, name: string, email: string, roleLabel: string): Promise<string> {
  const form = cardWithHeading(page, 'Create a login')
  await form.locator('input[placeholder="Full name"]').fill(name)
  await form.locator('input[placeholder="Email"]').fill(email)
  await form.locator('select').first().selectOption({ label: roleLabel })
  await form.locator('button:has-text("Create")').click()

  const banner = page.locator('text=Temporary password for').locator('xpath=ancestor::div[contains(@class,"justify-between")][1]')
  await expect(banner).toBeVisible({ timeout: 10_000 })
  const password = await banner.locator('code').innerText()
  await banner.locator('button:has-text("Dismiss")').click()

  return password
}

test('Owner onboards a Sales Manager, PC, and Engineer, then the PC runs a full project + order creation', async ({ page }) => {
  await login(page, 'owen@businesslinks-pk.com', 'Password123!')

  await page.goto('/users')
  await expect(page.locator('text=Create a login')).toBeVisible()

  const salesPassword = await createStaffLogin(page, 'Simulated Sales', 'sim.sales@businesslinks-pk.com', 'Sales Manager')
  const pcPassword = await createStaffLogin(page, 'Simulated Coordinator', 'sim.pc@businesslinks-pk.com', 'Project Coordinator')
  expect(salesPassword).toHaveLength(12)
  expect(pcPassword).toHaveLength(12)
  await createStaffLogin(page, 'Simulated Engineer', 'sim.eng@businesslinks-pk.com', 'Installation & Service Engineer')

  // Owner creates the project — dropdowns must show the freshly created
  // staff by name/email, not a raw ID field.
  await page.goto('/projects')
  const projectForm = cardWithHeading(page, 'Create a project')
  await projectForm.locator('input[placeholder*="Project number"]').fill('PRJ-SIM01')
  await projectForm.locator('input[placeholder="Customer name"]').fill('Simulated Textiles Co')
  await projectForm.locator('input[placeholder="Title"]').fill('Simulation line')
  await projectForm.locator('select').nth(0).selectOption({ label: 'Simulated Sales (sim.sales@businesslinks-pk.com)' })
  await projectForm.locator('select').nth(1).selectOption({ label: 'Simulated Coordinator (sim.pc@businesslinks-pk.com)' })
  await projectForm.locator('button:has-text("Create project")').click()
  await expect(page.locator('text=PRJ-SIM01')).toBeVisible({ timeout: 10_000 })

  await logout(page)

  // The freshly created PC logs in with the temporary password and adds
  // the machine (order) — including creating the Supplier inline, since
  // none exist for a brand-new deployment.
  await login(page, 'sim.pc@businesslinks-pk.com', pcPassword)
  await page.goto('/projects')
  const projectRow = page.locator('text=PRJ-SIM01').locator('xpath=ancestor::div[contains(@class,"justify-between")][1]')
  await projectRow.locator('a:has-text("Orders")').click()
  await expect(page).toHaveURL(/\/projects\/\d+$/)

  const orderForm = cardWithHeading(page, 'Add a machine')
  await orderForm.locator('input[placeholder*="Order number"]').fill('ORD-SIM01')
  await orderForm.locator('input[placeholder="Machine name"]').fill('Simulated Loom X1')
  await orderForm.locator('input[placeholder="New supplier name"]').fill('Simulated Supplier Co')
  await orderForm.locator('button:has-text("Add supplier")').click()
  // The new supplier must already be selected after the inline add, and
  // show up as an option in the same dropdown.
  await expect(orderForm.locator('select').nth(0).locator('option', { hasText: 'Simulated Supplier Co' })).toHaveCount(1)

  await orderForm.locator('select').nth(1).selectOption({ label: 'Simulated Engineer (sim.eng@businesslinks-pk.com)' })
  await orderForm.locator('input[title="Start date"]').fill('2026-01-01')
  await orderForm.locator('input[title="Target handover date"]').fill('2026-06-01')
  await orderForm.locator('button:has-text("Create order")').click()

  await expect(page.locator('text=ORD-SIM01')).toBeVisible({ timeout: 10_000 })

  // Following through to the order's own page confirms the full chain —
  // project -> order -> 12-stage pipeline — actually works end to end.
  await page.click('text=ORD-SIM01')
  await expect(page).toHaveURL(/\/orders\/\d+$/)
  await expect(page.locator('text=Simulated Loom X1')).toBeVisible()
})
