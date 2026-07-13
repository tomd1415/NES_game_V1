// Item #16 — "palettes on the background and for the sprites sometimes do not
// match ... the ones that are selected are not always represented."  This guards
// the Studio side (the ROM side is guarded by builder-tests/palette-render.mjs):
//   * Step B — the render pipeline maps the SELECTED slot to the right pixel
//     value (pixel 0 = backdrop/transparent; pixel N = slots[N-1]) for BOTH bg
//     and sprite palettes.  An off-by-one here is exactly "selected not
//     represented".
//   * Step A — the selected colours PERSIST across a save + reload.
const { test, expect } = require('@playwright/test');

test('#16 palette fidelity: selected colours map to the right pixels and persist', async ({ page }) => {
  await page.goto('/studio.html');
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');

  const V = { U: 0x0F, BGA: 0x30, BGB: 0x15, BGC: 0x27, SPA: 0x16, SPB: 0x2A, SPC: 0x12 };

  // Set distinct, recognisable palettes (as a PALS edit would) and persist.
  await page.evaluate((v) => {
    const s = window.Studio.getState();
    s.universal_bg = v.U;
    s.bg_palettes[0].slots = [v.BGA, v.BGB, v.BGC];
    s.sprite_palettes[1].slots = [v.SPA, v.SPB, v.SPC];
    window.Storage.saveCurrent(s);
  }, V);

  // Step B — mapping.
  const m = await page.evaluate((v) => {
    const s = window.Studio.getState(), R = window.NesRender;
    const bg = R.bgPaletteFor(s, 0), sp = R.spritePaletteFor(s, 1);
    return {
      bg: [bg.slot0, bg.slot1, bg.slot2, bg.slot3],
      bgPix: [R.pixelRgb(0, bg), R.pixelRgb(1, bg), R.pixelRgb(2, bg), R.pixelRgb(3, bg)],
      sp: [sp.slot0, sp.slot1, sp.slot2, sp.slot3],
      spPix0: R.pixelRgb(0, sp),
      spPix: [R.pixelRgb(1, sp), R.pixelRgb(2, sp), R.pixelRgb(3, sp)],
      exp: { U: R.nesRgb(v.U), BGA: R.nesRgb(v.BGA), BGB: R.nesRgb(v.BGB), BGC: R.nesRgb(v.BGC),
             SPA: R.nesRgb(v.SPA), SPB: R.nesRgb(v.SPB), SPC: R.nesRgb(v.SPC) },
    };
  }, V);
  // bg: slot0 = backdrop, slots 1-3 = the three selected values in order.
  expect(m.bg).toEqual([V.U, V.BGA, V.BGB, V.BGC]);
  expect(m.bgPix).toEqual([m.exp.U, m.exp.BGA, m.exp.BGB, m.exp.BGC]);
  // sprite: slot0 transparent (null), slots 1-3 = the three selected values.
  expect(m.sp).toEqual([-1, V.SPA, V.SPB, V.SPC]);
  expect(m.spPix0).toBeNull();
  expect(m.spPix).toEqual([m.exp.SPA, m.exp.SPB, m.exp.SPC]);

  // Step A — persistence across reload.
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.studioReady === '1');
  const after = await page.evaluate(() => {
    const s = window.Studio.getState();
    return { U: s.universal_bg, bg0: s.bg_palettes[0].slots, sp1: s.sprite_palettes[1].slots };
  });
  expect(after.U).toBe(V.U);
  expect(after.bg0).toEqual([V.BGA, V.BGB, V.BGC]);
  expect(after.sp1).toEqual([V.SPA, V.SPB, V.SPC]);
});
