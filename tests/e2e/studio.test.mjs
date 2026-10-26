/* =====================================================================
 * End-to-end checks in a real browser (Playwright + Chromium).
 *   node tests/e2e/studio.test.mjs          tests the source (index.html)
 *   node tests/e2e/studio.test.mjs --dist   tests the single-file build
 * Screenshots go to tests/e2e/out/. Needs: npm i -D playwright (or a
 * global Playwright with Chromium) and gltf-validator.
 * ===================================================================== */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = process.argv.includes('--dist');
const OUT = path.join(ROOT, 'tests/e2e/out' + (DIST ? '-dist' : ''));
fs.mkdirSync(OUT, { recursive: true });

let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(process.env.NODE_PATH || '/usr/local/lib/node_modules', 'playwright'))); }
const validator = require('gltf-validator');

/* ---------------------------------------------------------------- static server */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png' };
const base = DIST ? path.join(ROOT, 'dist') : ROOT;
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(base, p);
  if (!f.startsWith(base) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const URL0 = `http://localhost:${server.address().port}/`;

/* ---------------------------------------------------------------- tiny runner */
const results = [];
let current = '';
const ok = (cond, msg) => { results.push({ group: current, ok: !!cond, msg }); if (!cond) console.log('  ✗', msg); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function open(o) {
  const ctx = await browser.newContext({ viewport: { width: o.w, height: o.h }, deviceScaleFactor: o.touch ? 2 : 1, hasTouch: !!o.touch, isMobile: !!o.touch, locale: 'ar' });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto(URL0);
  await page.waitForFunction(() => window.__cylioReady, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  return { ctx, page };
}
const S = (page, fn, arg) => page.evaluate(fn, arg);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') });

/** Layout audit: overlapping regions, clipped labels, controls outside the screen, small touch targets. */
async function audit(page, label, o = {}) {
  const r = await page.evaluate(({ touch }) => {
    const vis = el => { const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden') return false; const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && !el.closest('[hidden]'); };
    const rect = el => el.getBoundingClientRect();
    const inter = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const out = { overlaps: [], clipped: [], offscreen: [], small: [] };
    const regions = ['.topbar', '.stage', '.bottom-nav'].map(s => document.querySelector(s)).filter(e => e && vis(e));
    const layout = document.getElementById('app').dataset.layout;
    if (layout === 'desktop') regions.push(...['.side', '.props'].map(s => document.querySelector(s)).filter(vis));
    for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) if (inter(rect(regions[i]), rect(regions[j])) > 2) out.overlaps.push(regions[i].className + ' × ' + regions[j].className);
    const overlays = ['.mode-badge', '.tool-strip', '.view-strip'].map(s => document.querySelector(s)).filter(e => e && vis(e));
    for (let i = 0; i < overlays.length; i++) for (let j = i + 1; j < overlays.length; j++) if (inter(rect(overlays[i]), rect(overlays[j])) > 2) out.overlaps.push(overlays[i].className + ' × ' + overlays[j].className);
    const wrap = document.querySelector('.vp-wrap');
    if (wrap && vis(wrap)) { const w = rect(wrap); for (const o of overlays) { const b = rect(o); if (b.top < w.top - 1 || b.bottom > w.bottom + 1 || b.left < w.left - 1 || b.right > w.right + 1) out.offscreen.push('overlay ' + o.className + ' outside the scene'); } }
    const sel = '.btn span, .seg-btn span, .part-label, .field-label > span, .sec-tab span, .nav-btn span, .props-head h2, .tl-clip-name, .save-text, .side-label, .group-head span, .readout span, .clip-name';
    for (const el of document.querySelectorAll(sel)) {
      if (!vis(el)) continue;
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow !== 'ellipsis') out.clipped.push(el.textContent.trim().slice(0, 30));
    }
    for (const el of document.querySelectorAll('.topbar button, .tool-strip button, .view-strip button, .bottom-nav button, .tl-head .tl-play')) {
      if (!vis(el)) continue;
      const b = rect(el);
      if (b.left < -1 || b.right > innerWidth + 1 || b.top < -1 || b.bottom > innerHeight + 1) out.offscreen.push(el.getAttribute('aria-label') || el.textContent.trim());
      if (touch && (b.width < 36 || b.height < 36)) out.small.push((el.getAttribute('aria-label') || el.textContent.trim()) + ` ${Math.round(b.width)}×${Math.round(b.height)}`);
    }
    return out;
  }, { touch: !!o.touch });
  ok(!r.overlaps.length, `${label}: no overlapping panels/tools ${r.overlaps.join(', ')}`);
  ok(!r.clipped.length, `${label}: no clipped labels ${r.clipped.join(' | ')}`);
  ok(!r.offscreen.length, `${label}: main buttons on screen ${r.offscreen.join(', ')}`);
  if (o.touch) ok(!r.small.length, `${label}: touch targets ≥ 36 px ${r.small.join(', ')}`);
}

/* ================================================================ desktop */
current = 'desktop';
console.log('▶ desktop 1300×860');
{
  const { page } = await open({ w: 1300, h: 860 });
  await shot(page, 'desktop-start');
  ok(await page.isVisible('.part-row[data-part="head"]'), 'starts in the editor with the default character');
  ok((await S(page, () => __cylio.studio.project.animations.length)) === 7, 'default project has the 7 built-in clips');
  await audit(page, 'start');

  // pick the head by clicking it in the scene
  const hp = await S(page, () => { const r = __cylio.vp.el.getBoundingClientRect(), p = __cylio.vp.partScreen('head'); return { x: r.left + p.x, y: r.top + p.y }; });
  await page.mouse.click(hp.x, hp.y);
  await page.waitForTimeout(150);
  ok((await S(page, () => __cylio.studio.ui.selected)) === 'head', 'clicking the head in the scene selects it');
  ok((await page.getAttribute('.part-row[data-part="head"]', 'aria-selected')) === 'true', 'selection is synced to the part list');
  await page.mouse.click(hp.x + 260, hp.y - 120);  // empty space
  await page.waitForTimeout(100);
  ok((await S(page, () => __cylio.studio.ui.selected)) === null, 'clicking empty space clears the selection');

  // shape: numeric field, symmetric edit, undo/redo
  await page.click('.part-row[data-part="leftArm"]');
  const box = page.locator('.props .num-field').nth(2).locator('.numbox');       // height
  await box.fill('80'); await box.press('Enter');
  const hs = await S(page, () => [__cylio.studio.project.shape.parts.leftArm.h, __cylio.studio.project.shape.parts.rightArm.h]);
  ok(hs[0] === 0.8 && hs[1] === 0.8, 'height field edits the arm and its mirror (symmetric)');
  await page.keyboard.press('Control+z');
  ok((await S(page, () => __cylio.studio.project.shape.parts.leftArm.h)) === 0.66, 'Ctrl+Z undoes the change');
  await page.keyboard.press('Control+Shift+z');
  ok((await S(page, () => __cylio.studio.project.shape.parts.leftArm.h)) === 0.8, 'Ctrl+Shift+Z redoes it');
  const linked = await S(page, () => { const s = __cylio.studio; s.setDim('torso', 'w', 0.8); s.commit(); const p = s.project.shape.parts.torso; return Math.abs(p.d / p.w - 0.4 / 0.69) < 0.01; });
  ok(linked, 'linked width/depth keeps the cross-section ratio');
  await page.keyboard.press('KeyR');
  ok(await S(page, () => __cylio.vp.gizmo.object === __cylio.vp.proxy), 'R attaches the scale gizmo in Shape mode');
  await page.keyboard.press('KeyE');
  ok(await S(page, () => !__cylio.vp.gizmo.object), 'rotate is not available in Shape mode (no gizmo)');

  // pose
  await page.click('.seg-btn[data-v="pose"]');
  await page.click('.part-row[data-part="rightArm"]');
  ok(await S(page, () => __cylio.vp.gizmo.object === __cylio.vp.char.joints.rightArm), 'rotate gizmo sits on the shoulder joint');
  const zf = page.locator('.props .num-field').nth(2).locator('.numbox');
  await zf.fill('-70'); await zf.press('Enter');
  const pr = await S(page, () => [__cylio.studio.project.pose.rightArm.rot[2], __cylio.studio.project.pose.leftArm.rot[2]]);
  ok(pr[0] === -70 && pr[1] === 70, 'pose rotation is mirrored to the other arm');
  ok(await S(page, () => JSON.stringify(__cylio.studio.project.animations) === JSON.stringify(window.__cylio.studio.project.animations) && __cylio.studio.project.animations.find(c => c.role === 'idle').tracks.rightArm[0].rot[2] === -2), 'editing the pose never touches the animations');
  await page.keyboard.press('KeyB');
  ok(await S(page, () => __cylio.vp.ghost.group.visible), 'B shows the base-pose comparison');
  await shot(page, 'desktop-pose');

  // appearance
  await page.click('#tab-look');
  await page.click('.part-row[data-part="torso"]');
  await page.fill('.props .hexbox', '#ff7a1a'); await page.press('.props .hexbox', 'Enter');
  ok((await S(page, () => __cylio.studio.project.appearance.parts.torso.color)) === '#FF7A1A', 'hex input sets the colour');
  await page.click('.props .color-btn');
  ok(await page.isVisible('.palette .pal-label'), 'palette shows the recent colours');
  await shot(page, 'desktop-look');
  await audit(page, 'appearance');

  // animation
  await page.click('#tab-anim');
  await page.click('.clip-row[data-clip="builtin_walk"]');
  ok(await page.isVisible('.timeline .tl-lanes'), 'timeline opens under the scene');
  const vpH = await S(page, () => __cylio.vp.el.clientHeight);
  ok(vpH > 380, `the scene stays large with the timeline open (${vpH}px)`);
  await page.click('.tl-label[data-j="leftLeg"]');
  await S(page, () => __cylio.studio.setTime(0.2));
  const before = await S(page, () => JSON.stringify(__cylio.studio.clip.tracks.leftLeg));
  const xf = page.locator('.props .num-field').nth(0).locator('.numbox');
  await xf.fill('-12'); await xf.press('Enter');
  ok(await page.isVisible('.tl-banner'), 'auto-key off: an edit becomes a visible pending change');
  ok((await S(page, () => JSON.stringify(__cylio.studio.clip.tracks.leftLeg))) === before, 'pending change does not modify the clip');
  await page.keyboard.press('KeyK');
  ok(await S(page, () => __cylio.studio.clip.tracks.leftLeg.some(k => Math.abs(k.t - 0.2) < 1e-6 && k.rot[0] === -12)), 'K records the pending change as a key');
  ok(await page.isHidden('.tl-banner'), 'banner disappears after recording');
  // drag the new key
  const kb = await page.locator('.tl-lane[data-j="leftLeg"] .key.sel').first().boundingBox();
  const lanesW = await S(page, () => document.querySelector('.tl-lanes').clientWidth);
  await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2); await page.mouse.down();
  await page.mouse.move(kb.x + kb.width / 2 + lanesW * 0.125, kb.y + kb.height / 2, { steps: 6 }); await page.mouse.up();
  const moved = await S(page, () => __cylio.studio.clip.tracks.leftLeg.map(k => k.t));
  ok(moved.some(t => Math.abs(t - 0.3) < 0.04) && !moved.some(t => Math.abs(t - 0.2) < 1e-6), `dragging a key moves it in time (${moved.join(', ')})`);
  await page.keyboard.press('Control+z');
  ok(await S(page, () => __cylio.studio.clip.tracks.leftLeg.some(k => Math.abs(k.t - 0.2) < 1e-6)), 'undo puts the dragged key back');
  // copy / paste / delete
  await S(page, () => { const s = __cylio.studio; s.setKeySel(['leftLeg|0.2']); });
  await page.keyboard.press('Control+c');
  await S(page, () => __cylio.studio.setTime(0.6));
  await page.keyboard.press('Control+v');
  ok(await S(page, () => __cylio.studio.clip.tracks.leftLeg.some(k => Math.abs(k.t - 0.6) < 1e-6 && k.rot[0] === -12)), 'copy + paste a key at the playhead');
  await page.keyboard.press('Delete');
  ok(await S(page, () => !__cylio.studio.clip.tracks.leftLeg.some(k => Math.abs(k.t - 0.6) < 1e-6)), 'Delete removes the selected key');
  // auto-key
  await page.click('.tl-auto');
  await S(page, () => __cylio.studio.setTime(0.1));
  await xf.fill('-5'); await xf.press('Enter');
  ok(await S(page, () => __cylio.studio.clip.tracks.leftLeg.some(k => Math.abs(k.t - 0.1) < 1e-6 && k.rot[0] === -5)), 'auto-key on: edits write keys directly');
  ok(await page.isVisible('.mb-rec'), 'auto-key state is visible on the scene');
  await page.click('.tl-auto');
  // ease + duration
  await S(page, () => { const s = __cylio.studio; s.setKeySel(['leftLeg|0.1']); s.setEase('easeOut'); });
  ok(await S(page, () => __cylio.studio.clip.tracks.leftLeg.find(k => Math.abs(k.t - 0.1) < 1e-6).ease === 'easeOut'), 'interpolation of the selected key can be changed');
  // play: time advances
  await page.locator('.vp-canvas').focus();
  await page.keyboard.press('Space');
  const t1 = await S(page, () => __cylio.studio.ui.anim.time);
  const advanced = await page.waitForFunction(t => __cylio.studio.ui.anim.playing && __cylio.studio.ui.anim.time !== t, t1, { timeout: 5000 }).then(() => true, () => false);
  ok(advanced, 'Space plays the animation');
  await page.keyboard.press('Space');
  ok(await page.isVisible('.clip-row.dirty .dirty-dot'), 'edited clip shows an unsaved indicator');
  await shot(page, 'desktop-anim');
  await audit(page, 'animation');

  // save → reload
  await page.keyboard.press('Control+s');
  await page.waitForFunction(() => __cylio.studio.ui.save.status === 'saved');
  ok(await page.isHidden('.clip-row.dirty .dirty-dot'), 'saving clears the unsaved indicators');
  await page.reload(); await page.waitForFunction(() => window.__cylioReady);
  const persisted = await S(page, () => ({ c: __cylio.studio.project.appearance.parts.torso.color, k: __cylio.studio.project.animations.find(c => c.id === 'builtin_walk').tracks.leftLeg.length, st: __cylio.studio.ui.save.status }));
  ok(persisted.c === '#FF7A1A' && persisted.k >= 3 && persisted.st === 'saved', 'project is restored after reload from device storage');
  // draft recovery
  await S(page, () => { const s = __cylio.studio; s.setDim('head', 'h', 0.6); s.commit(); });
  await page.waitForTimeout(900);
  await page.reload(); await page.waitForFunction(() => window.__cylioReady);
  ok(await S(page, () => __cylio.studio.project.shape.parts.head.h === 0.6 && __cylio.studio.dirty), 'unsaved changes are recovered after closing the tab');
  ok(await page.isVisible('.toast-action'), 'recovery offers to discard the recovered changes');

  // project dialog
  await page.click('.proj-btn'); await page.click('.menu-item:has-text("فتح مشروع")');
  ok(await page.waitForSelector('.proj-row', { timeout: 3000 }).then(() => true, () => false), 'open dialog lists the saved project');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal-back', { state: 'detached' });

  // GLB export + validation
  const glb = await S(page, async () => {
    let blob; const orig = URL.createObjectURL; URL.createObjectURL = b => { blob = b; return orig.call(URL, b); };
    try { await __cylio.io.exportGLB(); } finally { URL.createObjectURL = orig; }
    if (!blob) return null;
    const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  });
  ok(!!glb, 'GLB export produces a file');
  if (glb) {
    const bytes = new Uint8Array(Buffer.from(glb, 'base64'));
    fs.writeFileSync(path.join(OUT, 'character.glb'), bytes);
    const rep = await validator.validateBytes(bytes);
    ok(rep.issues.numErrors === 0, `GLB passes the Khronos validator (${rep.issues.numErrors} errors, ${rep.issues.numWarnings} warnings)`);
    ok(rep.info.animationCount === 7, `GLB contains the 7 animations (${rep.info.animationCount})`);
    const json = JSON.parse(Buffer.from(bytes.subarray(20, 20 + new DataView(bytes.buffer).getUint32(12, true))).toString());
    const names = json.nodes.map(n => n.name);
    ok(['root', 'torso', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'].every(n => names.includes(n)), 'GLB keeps the named joint hierarchy');
  }

  // test mode
  await page.keyboard.press('KeyT');
  ok(await page.isVisible('.test-hud'), 'T enters test mode');
  ok(await S(page, () => getComputedStyle(document.querySelector('.side')).visibility === 'hidden'), 'panels recede during the test');
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => __cylio.arena.ctrl.pos[2] < -0.6, null, { timeout: 8000 }).catch(() => {});
  await page.keyboard.up('KeyW');
  const st = await S(page, () => ({ z: __cylio.arena.ctrl.pos[2], st: __cylio.arena.state }));
  ok(st.z < -0.6, `walking forward moves the character (${st.z.toFixed(2)} m)`);
  await page.keyboard.press('Space');
  ok(await page.waitForFunction(() => !__cylio.arena.ctrl.grounded, null, { timeout: 4000 }).then(() => true, () => false), 'Space jumps');
  await shot(page, 'desktop-test');
  await page.keyboard.press('Escape');
  ok(await page.isHidden('.test-hud') && (await S(page, () => __cylio.vp.char.group.position.length())) === 0, 'Esc returns to editing with the character back in place');
  ok(page.errors.length === 0, 'no console errors: ' + page.errors.join(' | '));
}

/* ================================================================ phone portrait (Galaxy M13 ≈ 412 × 915) */
current = 'phone';
console.log('▶ phone 412×915');
{
  const { page } = await open({ w: 412, h: 915, touch: true });
  ok((await page.getAttribute('#app', 'data-layout')) === 'phone', 'phone layout is used');
  await shot(page, 'phone-start');
  await audit(page, 'phone start', { touch: true });
  const vpH = await S(page, () => __cylio.vp.el.clientHeight);
  ok(vpH > 520, `large preview on the phone (${vpH}px)`);
  const hp = await S(page, () => { const r = __cylio.vp.el.getBoundingClientRect(), p = __cylio.vp.partScreen('torso'); return { x: r.left + p.x, y: r.top + p.y }; });
  await page.touchscreen.tap(hp.x, hp.y);
  await page.waitForTimeout(450);
  ok((await S(page, () => __cylio.studio.ui.selected)) === 'torso', 'tapping a part selects it');
  ok((await page.getAttribute('.dock', 'data-sheet')) === 'half', 'selecting a part opens its tools in the bottom sheet');
  const propsTop = await S(page, () => document.querySelector('.props-head').getBoundingClientRect().top);
  ok(propsTop < 915 - 120, 'part properties are visible right away');
  await shot(page, 'phone-selected');
  // drag the sheet handle up
  const hb = await page.locator('.sheet-handle').boundingBox();
  await S(page, ({ x, y }) => {
    const el = document.querySelector('.sheet-handle');
    const ev = (t, yy) => el.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerId: 7, clientX: x, clientY: yy, pointerType: 'touch' }));
    ev('pointerdown', y); for (let i = 1; i <= 6; i++) ev('pointermove', y - i * 50); ev('pointerup', y - 300);
  }, { x: hb.x + hb.width / 2, y: hb.y + 10 });
  await page.waitForTimeout(350);
  ok((await page.getAttribute('.dock', 'data-sheet')) === 'full', 'the sheet can be dragged taller');
  await page.click('.nav-btn[data-sec="anim"]');
  await page.waitForTimeout(350);
  ok(await page.isVisible('.timeline .tl-play'), 'animation mode shows the timeline on the phone');
  const tl = await S(page, () => ({ t: document.querySelector('.timeline').getBoundingClientRect(), v: __cylio.vp.el.clientHeight }));
  ok(tl.v > 300, `the character stays visible above the timeline (${tl.v}px)`);
  await shot(page, 'phone-anim');
  await audit(page, 'phone animation', { touch: true });
  await page.click('.nav-btn.test');
  await page.waitForTimeout(300);
  ok(await page.isVisible('.stick') && await page.isVisible('.jump-btn'), 'touch joystick and jump button in test mode');
  const sb = await page.locator('.stick').boundingBox();
  await S(page, ({ x, y }) => {
    const el = document.querySelector('.stick');
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 3, clientX: x, clientY: y, pointerType: 'touch' }));
    el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 3, clientX: x, clientY: y - 60, pointerType: 'touch' }));
  }, { x: sb.x + sb.width / 2, y: sb.y + sb.height / 2 });
  ok(await page.waitForFunction(() => __cylio.arena.ctrl.pos[2] < -0.3, null, { timeout: 8000 }).then(() => true, () => false), 'the joystick moves the character');
  await shot(page, 'phone-test');
  await page.click('.test-top .btn');
  ok(await page.isHidden('.test-hud'), 'clear way back to editing');
  ok(page.errors.length === 0, 'no console errors: ' + page.errors.join(' | '));
}

/* ================================================================ phone landscape */
current = 'landscape';
console.log('▶ phone landscape 915×412');
{
  const { page } = await open({ w: 915, h: 412, touch: true });
  ok((await page.getAttribute('#app', 'data-layout')) === 'land', 'landscape layout is used');
  await audit(page, 'landscape', { touch: true });
  await page.click('.nav-btn[data-sec="anim"]');
  await page.waitForTimeout(300);
  ok(await page.isVisible('.timeline .tl-lanes'), 'timeline visible in landscape');
  const g = await page.locator('.tl-grip').boundingBox();
  await S(page, ({ x, y }) => {
    const el = document.querySelector('.tl-grip');
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 5, clientX: x, clientY: y }));
    el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 5, clientX: x, clientY: y - 60 }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 5, clientX: x, clientY: y - 60 }));
  }, { x: g.x + g.width / 2, y: g.y + 4 });
  await shot(page, 'landscape-anim');
  await audit(page, 'landscape animation', { touch: true });
  ok(page.errors.length === 0, 'no console errors: ' + page.errors.join(' | '));
}

/* ================================================================ desktop narrow */
current = 'desktop-1024';
console.log('▶ desktop 1024×700');
{
  const { page } = await open({ w: 1024, h: 700 });
  await audit(page, '1024 start');
  await S(page, () => { __cylio.studio.setSection('anim'); __cylio.studio.select('leftArm'); });
  await page.waitForTimeout(200);
  await audit(page, '1024 animation');
  await shot(page, 'desktop-1024-anim');
  ok(page.errors.length === 0, 'no console errors: ' + page.errors.join(' | '));
}

await browser.close();
server.close();
const failed = results.filter(r => !r.ok);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? '' : ' ✓'}`);
process.exit(failed.length ? 1 : 0);
