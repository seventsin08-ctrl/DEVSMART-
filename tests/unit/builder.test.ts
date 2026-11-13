import { describe, expect, it } from 'vitest';
import { BUILD_SELECTOR, clamp01, clipInset, easeInOut, easeOut, phases } from '../../src/site/builder';

describe('arrow builder maths', () => {
  it('easing stays inside 0…1 and hits both ends', () => {
    for (const f of [easeOut, easeInOut]) {
      expect(f(0)).toBe(0);
      expect(f(1)).toBeCloseTo(1, 10);
      for (let t = 0; t <= 1; t += 0.05) expect(f(t)).toBeGreaterThanOrEqual(0);
    }
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(9)).toBe(1);
  });

  it('reveals nothing at the start and the whole element (with margin) at the end', () => {
    const box = { l: 0, t: 0, w: 400, h: 200 };
    const e = { w: 400, h: 200 };
    expect(clipInset(1, box, e, 48)).toBe('inset(-48.0px -48.0px -48.0px -48.0px)');
    // halfway: a box dragged out from the top-left corner covers half of each side
    expect(clipInset(0.5, box, e, 0)).toBe('inset(0.0px 200.0px 100.0px 0.0px)');
    // text elements reveal only their tight text rectangle
    const text = { l: 20, t: 10, w: 300, h: 80 };
    expect(clipInset(1, text, { w: 700, h: 120 }, 10)).toBe('inset(0.0px 370.0px 20.0px 10.0px)');
  });

  it('is faster at higher speeds and bigger parts take longer to drag', () => {
    const slow = phases(1, 300, 200);
    const fast = phases(3, 300, 200);
    expect(fast.a).toBeLessThan(slow.a);
    expect(fast.b + fast.a + fast.c).toBeLessThan((slow.a + slow.b + slow.c) / 2.5);
    expect(phases(1, 1200, 900).b).toBeGreaterThan(phases(1, 40, 20).b);
    expect(phases(1, 4000, 4000).b).toBeLessThanOrEqual(600);
    expect(phases(0, 100, 100).a).toBeGreaterThan(0); // never divides by zero
  });

  it('targets headings, buttons, cards, images, stats, nav and footer', () => {
    for (const part of ['main h1', '.btn', '.glass', 'footer[data-edit="footer"]', 'header[data-edit="nav"] > nav', ':chips"] > li']) {
      expect(BUILD_SELECTOR).toContain(part);
    }
  });
});
