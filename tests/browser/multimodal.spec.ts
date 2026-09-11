import { test, expect, type Page } from '@playwright/test';

async function open(page: Page, room: string) {
  await page.goto('/?room=' + room);
  await expect(page.locator('.connection')).toHaveText('Live', { timeout: 30000 });
}
async function editCode(page: Page, source: string) {
  const input = page.locator('.monaco-editor textarea').first();
  await expect(input).toBeAttached({ timeout: 30000 });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate((text) => navigator.clipboard.writeText(text), source);
  await input.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+V');
}
const serviceCode = `export function storage() {\n  return { status: 'ready' };\n}\n\nexport function api() {\n  return storage();\n}\n`;

test('Monaco syncs between clients and agent translates in both directions without losing artwork', async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const a = await first.newPage();
  const b = await second.newPage();
  const errors: string[] = [];
  a.on('pageerror', (e) => errors.push(e.message));
  b.on('pageerror', (e) => errors.push(e.message));
  const room = 'multimodal-' + crypto.randomUUID();
  await open(a, room);
  await open(b, room);
  await a.getByRole('tab', { name: 'Split', exact: true }).click();
  await b.getByRole('tab', { name: 'Code', exact: true }).click();
  await editCode(a, serviceCode);
  await expect(b.locator('.view-lines')).toContainText('function api', { timeout: 30000 });
  await a.getByRole('button', { name: 'Toggle agent', exact: true }).click();
  await a.getByRole('button', { name: 'Code to canvas', exact: true }).click();
  await expect(a.locator('.agent-event.applied')).toContainText('Parsed', { timeout: 15000 });
  await expect(
    a.getByRole('button', { name: 'Select Code structure', exact: true }),
  ).toBeAttached();
  await expect(a.getByRole('button', { name: 'Select Coral sun', exact: true })).toBeAttached();
  await a.getByRole('button', { name: 'View canvas result', exact: true }).click();
  await a.screenshot({ path: '.local/forma-multimodal.png' });
  await a.getByRole('button', { name: 'Select Coral sun', exact: true }).click();
  await a.getByRole('button', { name: 'Canvas to code', exact: true }).click();
  await expect(a.locator('.agent-event.applied').first()).toContainText('Translated', {
    timeout: 15000,
  });
  await expect(b.locator('.view-lines')).toContainText('Coral sun');
  await a.getByLabel('Edit code', { exact: true }).uncheck();
  await expect(a.getByRole('button', { name: 'Canvas to code', exact: true })).toBeDisabled();
  await b.getByRole('button', { name: 'Toggle agent', exact: true }).click();
  await expect(b.getByLabel('Edit code', { exact: true })).not.toBeChecked();
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
});

test('automatic AST updates debounce incomplete code and preserve the shared code on failure', async ({
  page,
}) => {
  await open(page, 'automatic-' + crypto.randomUUID());
  await page.getByRole('tab', { name: 'Code', exact: true }).click();
  await page.getByRole('button', { name: 'Toggle agent', exact: true }).click();
  await page.getByLabel('Keep both in sync').check();
  await editCode(page, 'export function incomplete(');
  await expect(page.locator('.agent-event.error')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.view-lines')).toContainText('incomplete');
  await editCode(page, serviceCode);
  await expect(page.locator('.agent-event.applied')).toHaveCount(1, { timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Select api', exact: true })).toBeAttached();
  await page.getByLabel('Keep both in sync').uncheck();
  await page.reload();
  await expect(page.locator('.connection')).toHaveText('Live');
  await page.getByRole('tab', { name: 'Code', exact: true }).click();
  await expect(page.locator('.view-lines')).toContainText('function api', { timeout: 30000 });
  await page.getByRole('button', { name: 'Toggle agent', exact: true }).click();
  await expect(page.getByLabel('Keep both in sync')).not.toBeChecked();
});

test("code undo is local and cannot remove another collaborator's code", async ({ browser }) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const a = await first.newPage();
  const b = await second.newPage();
  const room = 'code-undo-' + crypto.randomUUID();
  await open(a, room);
  await open(b, room);
  await a.getByRole('tab', { name: 'Code', exact: true }).click();
  await b.getByRole('tab', { name: 'Code', exact: true }).click();
  await editCode(a, serviceCode);
  await expect(b.locator('.view-lines')).toContainText('function api');
  await b.locator('.monaco-editor textarea').first().focus();
  await b.keyboard.press('ControlOrMeta+End');
  await b.keyboard.insertText('\n// remote collaborator');
  await expect(a.locator('.view-lines')).toContainText('remote collaborator');
  await a.getByRole('button', { name: 'Undo (Ctrl Z)', exact: true }).click();
  await a.locator('.monaco-editor textarea').first().focus();
  await a.keyboard.press('ControlOrMeta+End');
  await expect(a.locator('.view-lines')).toContainText('remote collaborator');
  await first.close();
  await second.close();
});

test('mobile split and agent controls remain accessible', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await open(page, 'mobile-code-' + crypto.randomUUID());
  await page.getByRole('tab', { name: 'Split', exact: true }).click();
  await editCode(page, serviceCode);
  await page.screenshot({ path: '.local/forma-mobile-split.png' });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'Toggle agent', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Code to canvas', exact: true })).toBeVisible();
  await page.screenshot({ path: '.local/forma-mobile-agent.png' });
  await context.close();
});
