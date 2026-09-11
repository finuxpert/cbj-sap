import { expect, test } from '@playwright/test'

const TARGET = process.env.SPHERE_VISUAL_BASE_URL || 'https://sphere.astraotoparts.co.id/dev/#/tool/logs'
const compareSnapshots = process.env.SPHERE_VISUAL_COMPARE === '1'

async function attachPanel(page, name) {
  const panel = page.locator('.rundeckPanel')
  const image = await panel.screenshot({ animations: 'disabled' })
  await test.info().attach(name, { body: image, contentType: 'image/png' })
  if (compareSnapshots) {
    await expect(panel).toHaveScreenshot(`${name}.png`, {
      animations: 'disabled',
      maxDiffPixelRatio: 0.015,
    })
  }
}

async function fontSize(locator) {
  return locator.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize))
}

async function verticalGap(upper, lower) {
  const [a, b] = await Promise.all([upper.boundingBox(), lower.boundingBox()])
  if (!a || !b) return null
  return b.y - (a.y + a.height)
}

test.beforeEach(async ({ page }) => {
  await page.goto(TARGET, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.rundeckPanel')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: /SAP Performance Summary/i })).toBeVisible()
})

test('desktop operational hierarchy stays readable and overflow-safe', async ({ page }) => {
  const panel = page.locator('.rundeckPanel')
  const header = page.locator('.rundeckLandscapeHeader')
  const primary = page.locator('.rundeckIncident').first()
  const servers = page.locator('.rundeckServerSection')
  const trend = page.locator('.rundeckMonitoringHead').first()

  await expect(servers).toBeVisible()
  await expect(page.getByText('Host Resource', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('SAP Workload', { exact: true }).first()).toBeVisible()

  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(bodyOverflow).toBeLessThanOrEqual(2)

  const headerGap = await verticalGap(header, primary)
  const serverTrendGap = await verticalGap(servers, trend)
  if (headerGap !== null) expect(headerGap).toBeGreaterThanOrEqual(-2)
  if (serverTrendGap !== null) expect(serverTrendGap).toBeGreaterThanOrEqual(4)

  const tableHeaderSize = await fontSize(page.locator('.rundeckServerTable th').first())
  const tableBodySize = await fontSize(page.locator('.rundeckServerTable td').first())
  expect(tableHeaderSize).toBeGreaterThanOrEqual(8)
  expect(tableBodySize).toBeGreaterThanOrEqual(9)

  const panelBox = await panel.boundingBox()
  expect(panelBox?.width || 0).toBeGreaterThan(900)
  await attachPanel(page, `sphere-${test.info().project.name}-overview`)
})

test('evaluation engine renders adaptive daily weekly monthly review', async ({ page }) => {
  const evaluation = page.locator('.rundeckEvaluation')
  await evaluation.scrollIntoViewIfNeeded()
  await expect(evaluation).toBeVisible()
  await expect(evaluation.getByRole('heading', { name: /Performance Evaluation/i })).toBeVisible()

  for (const label of ['1 Day', '7 Days', '30 Days', 'All', 'Programs', 'Jobs']) {
    await expect(evaluation.getByRole('button', { name: label, exact: true })).toBeVisible()
  }

  await evaluation.getByRole('button', { name: '30 Days', exact: true }).click()
  await expect(evaluation.getByText('30 Days', { exact: true }).first()).toBeVisible()
  await expect(evaluation.locator('.rundeckEvaluationTable')).toBeVisible({ timeout: 15_000 })

  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(bodyOverflow).toBeLessThanOrEqual(2)
  await attachPanel(page, `sphere-${test.info().project.name}-evaluation`)
})

test('SAP issue lifecycle distinguishes cleared current state from historical peak', async ({ page }) => {
  const issues = page.locator('.rundeckEvidenceGroup')
  await issues.scrollIntoViewIfNeeded()
  if (!(await issues.getAttribute('open'))) await issues.locator('summary').click()

  await expect(issues.getByText('SAP Signal', { exact: true })).toBeVisible()
  await expect(issues.getByText('Current Severity', { exact: true })).toBeVisible()
  await expect(issues.getByText('Peak Severity', { exact: true })).toBeVisible()

  const resolvedRows = issues.locator('tbody tr').filter({ hasText: 'RESOLVED' })
  const resolvedCount = await resolvedRows.count()
  for (let index = 0; index < resolvedCount; index += 1) {
    await expect(resolvedRows.nth(index)).toContainText('CLEARED')
  }

  await attachPanel(page, `sphere-${test.info().project.name}-issues`)
})
