import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';

async function ready(page: Page, room: string) {
  await page.goto('/?room=' + room);
  await expect(page.locator('.connection')).toHaveText('Live', { timeout: 30000 });
  await expect(page.getByRole('button', { name: 'Select Coral sun', exact: true })).toBeVisible();
}
async function canvasPixels(page: Page) {
  return page
    .locator('.canvas-host canvas')
    .first()
    .evaluate((canvas: HTMLCanvasElement) => {
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let opaque = 0;
      const colors = new Set<string>();
      for (let i = 0; i < data.length; i += 64)
        if (data[i + 3] > 0) {
          opaque++;
          colors.add(data.slice(i, i + 3).join(','));
        }
      return { opaque, colors: colors.size };
    });
}
test('desktop canvas renders and supports draw, undo, inspector, reparent, and export', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page, 'visual-' + crypto.randomUUID());
  const pixels = await canvasPixels(page);
  expect(pixels.opaque).toBeGreaterThan(2000);
  expect(pixels.colors).toBeGreaterThan(20);
  await page.screenshot({ path: '.local/forma-desktop.png' });
  await page.getByRole('button', { name: 'Select Coral sun', exact: true }).click();
  await expect(page.getByLabel('W', { exact: true })).toHaveValue('100');
  await page.getByLabel('W', { exact: true }).fill('140');
  await page.getByLabel('W', { exact: true }).press('Enter');
  await expect(page.getByLabel('W', { exact: true })).toHaveValue('140');
  await page.getByLabel('Parent layer').selectOption('shape-study');
  await expect(page.getByLabel('Parent layer')).toHaveValue('shape-study');
  await page.screenshot({ path: '.local/forma-inspector.png' });
  await page.getByRole('button', { name: 'Rectangle (R)', exact: true }).click();
  const box = (await page.getByTestId('vector-canvas').boundingBox())!;
  await page.mouse.move(box.x + 100, box.y + 160);
  await page.mouse.down();
  await page.mouse.move(box.x + 190, box.y + 230);
  await page.mouse.up();
  await expect(page.getByLabel('Layer name')).toHaveValue('Rectangle');
  await page.getByRole('button', { name: 'Undo (Ctrl Z)', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select Rectangle', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo (Ctrl Shift Z)', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select Rectangle', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('Export format').selectOption('svg');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export SVG', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.svg$/);
  expect(errors).toEqual([]);
});

test('two isolated browsers synchronize edits, presence, offline catch-up, and reload', async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const a = await first.newPage();
  const b = await second.newPage();
  const room = 'sync-' + crypto.randomUUID();
  await ready(a, room);
  await ready(b, room);
  await expect(a.locator('.avatars .avatar')).toHaveCount(2);
  const contentBefore = await b
    .locator('.canvas-host canvas')
    .first()
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  const overlayBefore = await b
    .locator('.canvas-host canvas')
    .nth(1)
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  const canvasBox = (await a.getByTestId('vector-canvas').boundingBox())!;
  await a.mouse.move(canvasBox.x + 120, canvasBox.y + 140);
  await expect
    .poll(() =>
      b
        .locator('.canvas-host canvas')
        .nth(1)
        .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
    )
    .not.toEqual(overlayBefore);
  expect(
    await b
      .locator('.canvas-host canvas')
      .first()
      .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
  ).toEqual(contentBefore);
  await a.getByRole('button', { name: 'Select Coral sun', exact: true }).click();
  await b.getByRole('button', { name: 'Select Coral sun', exact: true }).click();
  await a.getByLabel('W', { exact: true }).fill('175');
  await a.getByLabel('W', { exact: true }).press('Enter');
  await expect(b.getByLabel('W', { exact: true })).toHaveValue('175');
  await second.setOffline(true);
  await b.getByLabel('H', { exact: true }).fill('135');
  await b.getByLabel('H', { exact: true }).press('Enter');
  await a.getByLabel('W', { exact: true }).fill('190');
  await a.getByLabel('W', { exact: true }).press('Enter');
  await second.setOffline(false);
  await expect(b.locator('.connection')).toHaveText('Live', { timeout: 30000 });
  await expect(a.getByLabel('H', { exact: true })).toHaveValue('135', { timeout: 30000 });
  await expect(b.getByLabel('W', { exact: true })).toHaveValue('190');
  await b.reload();
  await expect(b.locator('.connection')).toHaveText('Live');
  await b.getByRole('button', { name: 'Select Coral sun', exact: true }).click();
  await expect(b.getByLabel('W', { exact: true })).toHaveValue('190');
  await second.close();
  await expect(a.locator('.avatars .avatar')).toHaveCount(1, { timeout: 35000 });
  await first.close();
  const fresh = await browser.newContext();
  const freshPage = await fresh.newPage();
  await ready(freshPage, room);
  await freshPage.getByRole('button', { name: 'Select Coral sun', exact: true }).click();
  await expect(freshPage.getByLabel('W', { exact: true })).toHaveValue('190');
  await expect(freshPage.getByLabel('H', { exact: true })).toHaveValue('135');
  await fresh.close();
});

test('cursor and selection traffic do not write D1 snapshots', async ({ page }) => {
  const room = 'ephemeral-' + crypto.randomUUID();
  await ready(page, room);
  const snapshot = () => {
    const output = execFileSync(
      process.execPath,
      [
        'node_modules/wrangler/bin/wrangler.js',
        'd1',
        'execute',
        'forma-db',
        '--local',
        '--command',
        `SELECT revision, updated_at, length(state) AS bytes FROM canvas_documents WHERE id = '${room}'`,
        '--json',
      ],
      { encoding: 'utf8', timeout: 30000 },
    );
    return JSON.parse(output)[0].results[0];
  };
  await expect.poll(snapshot).toBeTruthy();
  const before = snapshot();
  await page.getByRole('button', { name: 'Select Coral sun', exact: true }).click();
  const box = (await page.getByTestId('vector-canvas').boundingBox())!;
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.move(box.x + 500, box.y + 300, { steps: 40 });
  await page.getByRole('button', { name: 'Select Mint disc', exact: true }).click();
  await page.getByRole('tab', { name: 'Code', exact: true }).click();
  const editor = page.locator('.monaco-editor textarea').first();
  await expect(editor).toBeAttached();
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  expect(snapshot()).toEqual(before);
});

test('mobile canvas stays visible and panels remain usable', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto('/?room=mobile-' + crypto.randomUUID());
  await expect(page.locator('.connection')).toHaveText('Live', { timeout: 30000 });
  const pixels = await canvasPixels(page);
  expect(pixels.opaque).toBeGreaterThan(1000);
  await page.screenshot({ path: '.local/forma-mobile.png' });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'Open layers', exact: true }).click();
  await page.getByRole('button', { name: 'Select Coral sun', exact: true }).click();
  await page.getByRole('button', { name: 'Close layers', exact: true }).click();
  await page.getByRole('button', { name: 'Open properties', exact: true }).click();
  await expect(page.getByLabel('Layer name')).toHaveValue('Coral sun');
  await page.screenshot({ path: '.local/forma-mobile-inspector.png' });
  await context.close();
});

test('canvas drag and resize commit geometry, and groups move their children', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page, 'transform-' + crypto.randomUUID());
  await page.getByRole('button', { name: 'Select Coral sun', exact: true }).click();
  const scene = await page
    .locator('.canvas-host canvas')
    .first()
    .evaluate((canvas: HTMLCanvasElement) => {
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let left = canvas.width;
      let top = canvas.height;
      let right = 0;
      let bottom = 0;
      for (let y = 0; y < canvas.height; y++)
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          if (
            x < canvas.width * 0.6 &&
            data[i] === 243 &&
            data[i + 1] === 143 &&
            data[i + 2] === 120 &&
            data[i + 3] === 255
          ) {
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
          }
        }
      return { left, top, right, bottom, ratio: canvas.width / canvas.clientWidth };
    });
  const box = (await page.getByTestId('vector-canvas').boundingBox())!;
  const x = box.x + (scene.left + scene.right) / 2 / scene.ratio;
  const y = box.y + (scene.top + scene.bottom) / 2 / scene.ratio;
  const scale = (scene.right - scene.left + 1) / scene.ratio / 100;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 50, y + 30, { steps: 8 });
  await page.mouse.up();
  const changedX = Number(await page.getByLabel('X', { exact: true }).inputValue());
  expect(changedX).toBeGreaterThan(480);
  const right = box.x + scene.right / scene.ratio + 50 + 1;
  const bottom = box.y + scene.bottom / scene.ratio + 30 + 1;
  await page.mouse.move(right, bottom);
  await page.mouse.down();
  await page.mouse.move(right + 25, bottom + 25, { steps: 8 });
  await page.mouse.up();
  expect(Number(await page.getByLabel('W', { exact: true }).inputValue())).toBeGreaterThan(
    100 + 15 / scale,
  );
  await page
    .getByRole('button', { name: 'Select Mint disc', exact: true })
    .click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Group selection', exact: true }).click();
  await expect(page.getByLabel('Layer name')).toHaveValue('Group');
  const groupX = Number(await page.getByLabel('X', { exact: true }).inputValue());
  await page.getByLabel('X', { exact: true }).fill(String(groupX + 40));
  await page.getByLabel('X', { exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Select Mint disc', exact: true }).click();
  await expect(page.getByLabel('X', { exact: true })).toHaveValue('223');
  await page.getByRole('button', { name: 'Select Group', exact: true }).click();
  await page.getByRole('button', { name: 'Ungroup', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select Group', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
  await page.getByRole('button', { name: 'Line (L)', exact: true }).click();
  await page.mouse.move(box.x + 150, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 250, box.y + 200, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByLabel('Layer name')).toHaveValue('Line');
  await expect(page.getByLabel('Rotation', { exact: true })).toHaveValue('-45');
  expect(errors).toEqual([]);
});
