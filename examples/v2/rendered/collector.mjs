import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { digest, freezeJson, surfaceRenderDigest, surfaceWindowStarts, surfaceVisible, validateSurfacePolicy } from 'quality-gate-sgd';
import { measureSurface } from './measure.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const safe = value => value.replace(/[^a-z0-9_-]/gi, '-');
const unique = values => [...new Map(values.map(value => [digest(value), value])).values()];

/** Pin both executable collection code and operator-owned selectors/effect checks. */
export function collectorIdentity(settings) {
  return digest({ protocol: 'quality-sgd.playwright-collector/v1', settings,
    files: ['collector.mjs', 'measure.mjs', 'package-lock.json'].map(name => ({ name, digest: hash(readFileSync(new URL(name, import.meta.url))) })),
    helpers: [surfaceWindowStarts.toString(), surfaceVisible.toString()],
  });
}

async function settle(page) {
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
}

async function activate(page, id, method, action) {
  const target = page.locator(`[data-qg-id="${id}"]`);
  const evidence = { id, method, reachable: false, focusVisible: false, activated: false, targetVisible: false, targetWidth: 0, targetHeight: 0 };
  if (await target.count() !== 1) return evidence;
  const before = await page.locator(action.target).evaluate((node, kind) => kind === 'toggle' ? node.open : node.textContent.trim(), action.kind);
  try {
    if (method === 'keyboard') {
      // Tab from the actual current document focus; no direct focus() shortcut proves reachability.
      for (let steps = 0; steps < 32; steps++) {
        await page.keyboard.press('Tab');
        if (await target.evaluate(node => node === document.activeElement)) { evidence.reachable = true; break; }
      }
    } else { await target.scrollIntoViewIfNeeded(); evidence.reachable = await target.isVisible(); }
    const properties = await target.evaluate(node => {
      const bounds = node.getBoundingClientRect(), style = getComputedStyle(node);
      const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      return { targetWidth: bounds.width, targetHeight: bounds.height,
        targetVisible: bounds.top >= 0 && bounds.bottom <= innerHeight && bounds.left >= 0 && bounds.right <= innerWidth && (node === hit || node.contains(hit)),
        focusVisible: node.matches(':focus-visible') && parseFloat(style.outlineWidth) >= 2 && style.outlineStyle !== 'none' && !['transparent', 'rgba(0, 0, 0, 0)'].includes(style.outlineColor) };
    });
    Object.assign(evidence, properties);
    if (!evidence.reachable) return evidence;
    if (method === 'keyboard') await page.keyboard.press('Enter');
    else await target.tap({ timeout: 1500 });
    await settle(page);
    const after = await page.locator(action.target).evaluate((node, kind) => kind === 'toggle' ? node.open : node.textContent.trim(), action.kind);
    evidence.activated = action.kind === 'toggle' ? before !== after : after === action.value && before !== after;
  } catch { /* A tested unreachable/covered action is an observed defect, not a fabricated success. */ }
  return evidence;
}

/**
 * Explicit localhost/example browser collector. It observes the supplied routes and DOM;
 * unsupported dynamic geometry, assets or incomplete states remain unavailable.
 * The browser is supplied by the caller. Core imports never install or launch a browser.
 */
export async function collectSurface({ browser, baseURL, policy: suppliedPolicy, settings: suppliedSettings, data, outputDir }) {
  const policy = validateSurfacePolicy(suppliedPolicy);
  digest(suppliedSettings);
  const settings = freezeJson(structuredClone(suppliedSettings));
  const expectedDataDigest = digest(data);
  const capturedData = freezeJson(structuredClone(data));
  if (collectorIdentity(settings) !== policy.collectorDigest) throw new Error('Collector settings/code differ from the trusted policy');
  const origin = new URL(baseURL).origin;
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseURL).hostname)) throw new Error('This example collector supports explicit localhost origins only');
  await mkdir(outputDir, { recursive: true });
  const resources = new Map(), states = []; let platformEvidence;
  for (const required of policy.states) {
    const unavailable = [], defects = [], interactions = [], captures = [], scrollProbes = [];
    const context = await browser.newContext({ viewport: required.viewport, deviceScaleFactor: 1, hasTouch: required.input === 'touch', locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'reduce', colorScheme: 'light' });
    const page = await context.newPage();
    page.setDefaultTimeout(3000);
    page.on('pageerror', () => unavailable.push('Page script failed'));
    page.on('requestfailed', () => unavailable.push('A required request failed'));
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin || !policy.states.some(state => state.route === `${url.pathname}${url.search}`)) { unavailable.push('Undeclared network resource'); await route.abort(); }
      else await route.continue();
    });
    const load = async () => {
      const response = await page.goto(new URL(required.route, baseURL).href, { waitUntil: 'load' });
      if (!response?.ok()) throw new Error('Route did not load successfully');
      const bytes = await response.body(), bodyDigest = hash(bytes);
      if (resources.has(required.route) && resources.get(required.route) !== bodyDigest) throw new Error('Source changed during collection');
      resources.set(required.route, bodyDigest);
      await writeFile(join(outputDir, `source-${bodyDigest}.html`), bytes);
      if (digest(JSON.parse(await page.locator(settings.dataSelector).textContent())) !== expectedDataDigest) throw new Error('Rendered source data differs from the supplied data revision');
      await settle(page);
      const platform = await page.evaluate(() => {
        const canvas = document.createElement('canvas'), drawing = canvas.getContext('2d');
        drawing.font = '18px Arial';
        return { userAgent: navigator.userAgent, platform: navigator.platform, fontProbe: drawing.measureText('Quality 0123456789 inventory').width, fonts: [...document.fonts].map(font => ({ family: font.family, status: font.status })) };
      });
      if (platform.fonts.some(font => font.status !== 'loaded')) throw new Error('A required font did not load');
      if (platformEvidence && digest(platformEvidence) !== digest(platform)) throw new Error('Font/browser environment changed during collection');
      platformEvidence = platform;
      if (required.interaction === 'open' && !await page.locator(settings.disclosureTarget).evaluate(node => node.open)) {
        const action = settings.actions.find(value => value.id === settings.disclosureId);
        const transition = await activate(page, action.id, required.input, action);
        if (!transition.activated) throw new Error(`Required open state is unreachable using ${required.input}`);
      }
      const actual = await page.locator(settings.disclosureTarget).evaluate(node => node.open ? 'open' : 'closed');
      if (actual !== required.interaction) throw new Error('Required interaction state was not reached');
      await page.evaluate(() => scrollTo(0, 0)); await settle(page);
    };
    let measured = { elements: [], anchors: [], chromeHeight: 0, documentHeight: required.viewport.height, unavailable: [], defects: [] }, windows = [];
    try {
      await load();
      const measure = () => page.evaluate(measureSurface, { inventory: policy.elements, approvedLabels: settings.approvedLabels, chromeSelector: settings.chromeSelector });
      measured = await measure();
      const repeat = await measure();
      if (digest(measured) !== digest(repeat)) unavailable.push('Layout did not settle');
      const dimensions = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scale: visualViewport.scale, dpr: devicePixelRatio }));
      if (dimensions.width !== required.viewport.width || dimensions.height !== required.viewport.height || dimensions.scale !== 1 || dimensions.dpr !== 1) unavailable.push('Viewport, zoom or device scale mismatch');
      unavailable.push(...measured.unavailable); defects.push(...measured.defects);
      const geometry = { ...measured, viewport: required.viewport };
      for (const requested of [0.25, 0.5, 0.75, 1.25, 1.5, 1.75].map(value => Math.min(measured.documentHeight - required.viewport.height, value))) {
        await page.evaluate(top => scrollTo(0, top), requested);
        const observed = await page.evaluate(() => scrollY);
        scrollProbes.push({ requested, observed });
        if (!Number.isSafeInteger(observed) || Math.abs(observed - requested) > 0.50001) unavailable.push('Fractional CSS scrolling is outside this collector model');
      }
      const starts = surfaceWindowStarts(geometry);
      const natural = new Set([0, Math.max(0, measured.documentHeight - required.viewport.height), ...measured.anchors.map(anchor => Math.max(0, Math.min(measured.documentHeight - required.viewport.height, Math.round(anchor.top - measured.chromeHeight))))]);
      const capturedMemberships = new Set();
      for (const scrollTop of starts) {
        await page.evaluate(top => scrollTo(0, top), scrollTop);
        const current = await measure();
        const actualScroll = await page.evaluate(() => scrollY);
        if (actualScroll !== scrollTop || digest(current.elements) !== digest(measured.elements) || current.chromeHeight !== measured.chromeHeight || current.documentHeight !== measured.documentHeight) unavailable.push('Unsupported nonstationary geometry or scroll position');
        unavailable.push(...current.unavailable); defects.push(...current.defects);
        const visible = surfaceVisible(geometry, scrollTop);
        const id = `viewport-${scrollTop}`;
        windows.push({ id, scrollTop, visible });
        // Keep a PNG for every distinct membership, every represented natural anchor, and both ends.
        const membership = digest(visible);
        if (natural.has(scrollTop) || !capturedMemberships.has(membership)) {
          const file = `${safe(required.id)}-${id}.png`;
          const bytes = await page.screenshot({ animations: 'disabled' });
          await writeFile(join(outputDir, file), bytes);
          captures.push({ id, scrollTop, digest: hash(bytes), path: file }); capturedMemberships.add(membership);
        }
      }
      for (const id of required.actions) {
        await load();
        const action = settings.actions.find(value => value.id === id);
        if (!action) throw new Error('Action effect is not configured by the operator');
        interactions.push(await activate(page, id, required.input, action));
      }
    } catch (error) { unavailable.push(error instanceof Error ? error.message : 'Render collection failed'); }
    finally { await context.close(); }
    const reasons = [...new Set(unavailable)];
    states.push({ id: required.id, route: required.route, viewport: required.viewport, input: required.input, interaction: required.interaction,
      complete: reasons.length === 0, unavailable: reasons, documentHeight: measured.documentHeight, chromeHeight: measured.chromeHeight,
      anchors: measured.anchors, elements: measured.elements, scrollProbes, windows, interactions, defects: unique(defects), captures });
  }
  const sourceManifest = [...resources].sort(([left], [right]) => left.localeCompare(right)).map(([route, bodyDigest]) => ({ route, bodyDigest }));
  const sourceDigest = digest(sourceManifest);
  const dataDigest = expectedDataDigest, artifactDigest = digest({ sourceDigest, dataDigest });
  const environment = { browser: browser.version(), platformEvidence: platformEvidence ?? null, policyDigest: digest(policy), viewportModel: 'integer-css-pixels-dpr1-zoom1', locale: 'en-US', timezone: 'UTC', colorScheme: 'light', reducedMotion: 'reduce' };
  const environmentDigest = digest(environment);
  const body = { protocol: 'quality-sgd.surface-evidence/v1', scrollModel: policy.scrollModel, artifactDigest, environmentDigest, sourceDigest, dataDigest, collectorDigest: policy.collectorDigest, policyDigest: digest(policy), browser: browser.version(), states };
  const report = { ...body, renderDigest: surfaceRenderDigest(body) };
  await writeFile(join(outputDir, 'surface.json'), `${JSON.stringify({ policy, sourceManifest, data: capturedData, environment, report }, null, 2)}\n`);
  return report;
}
