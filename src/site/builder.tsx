// "Arrow builder": every visible part of a page (navigation, headings, text, buttons, cards,
// images, stats, footer) is drawn into existence by its own cursor, which flies in, grabs the
// top-left corner and drags out a selection box. The real element is revealed inside the growing
// box, so the cursor is literally what creates it, like watching a design tool being operated.
//
// Presentation only: the content is ordinary DOM from the start (screen readers and search see
// it), elements are just masked until their turn. Off for visitors who prefer reduced motion,
// in the studio preview, and when switched off in Theme → Arrow builder animation.
import { Play, RotateCcw, Square, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Theme } from '@shared/site/schema';

// ───────── pure helpers (unit-tested) ─────────
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export interface Box { l: number; t: number; w: number; h: number }

/**
 * CSS inset() that shows only the part of an element covered by a box dragged out from its
 * top-left corner (p = 0…1). `m` widens the final reveal so shadows and glyph overhang are
 * never cut off.
 */
export function clipInset(p: number, c: Box, e: { w: number; h: number }, m: number): string {
  const top = c.t - m;
  const left = c.l - m;
  const right = e.w - (c.l + c.w * p) - m * p;
  const bottom = e.h - (c.t + c.h * p) - m * p;
  return `inset(${top.toFixed(1)}px ${right.toFixed(1)}px ${bottom.toFixed(1)}px ${left.toFixed(1)}px)`;
}

/** Real durations (ms) of the three phases of one build: fly in, drag, finish. */
export function phases(speed: number, w: number, h: number): { a: number; b: number; c: number } {
  const s = Math.max(0.25, speed);
  return { a: 230 / s, b: Math.min(600, Math.max(300, 240 + (w + h) * 0.11)) / s, c: 320 / s };
}

// ───────── what gets built ─────────
export type BuildKind = 'nav' | 'heading' | 'text' | 'label' | 'button' | 'card' | 'image' | 'stat' | 'footer';

const RULES: [string, BuildKind][] = [
  ['header[data-edit="nav"] > nav', 'nav'],
  ['footer[data-edit="footer"]', 'footer'],
  ['main h1, main h2', 'heading'],
  ['main [data-edit$=":eyebrow"]', 'label'],
  ['main [data-edit$=":subtitle"], main [data-edit$=":text"]', 'text'],
  ['.btn', 'button'],
  ['.glass', 'card'],
  ['main [data-edit$=":visual"], main img', 'image'],
  ['main [data-edit$=":chips"] > li', 'stat'],
];
export const BUILD_SELECTOR = RULES.map(([s]) => s).join(',');
const LABELS: Record<BuildKind, string> = {
  nav: 'Navbar', heading: 'Heading', text: 'Text', label: 'Label', button: 'Button', card: 'Card', image: 'Image', stat: 'Stat', footer: 'Footer',
};
const TIGHT_TEXT = new Set<BuildKind>(['heading', 'text']);
const I_BEAM = new Set<BuildKind>(['heading', 'text', 'label']);
const BIG = new Set<BuildKind>(['card', 'image', 'nav', 'footer']);

const PALETTE = [
  { c: '#f5b700', ink: '#1b1400' }, { c: '#ff5d7a', ink: '#ffffff' }, { c: '#18b6e6', ink: '#00222e' },
  { c: '#7c5cff', ink: '#ffffff' }, { c: '#14c8a0', ink: '#00241c' }, { c: '#ff8a1f', ink: '#2a1200' },
  { c: '#2f6bff', ink: '#ffffff' },
];

function kindOf(el: Element): BuildKind | null {
  for (const [sel, kind] of RULES) if (el.matches(sel)) return kind;
  return null;
}

/** Skips parts that must stay instantly usable (forms, dialogs) or belong to classic-animated sections. */
function shouldBuild(el: HTMLElement, kind: BuildKind): boolean {
  if (el.closest('[data-build-off], [role="dialog"], #mobile-menu')) return false;
  const section = el.closest<HTMLElement>('[data-section-type]');
  if (section) {
    if (section.dataset.anim !== 'assemble') return false;
    const type = section.dataset.sectionType;
    if (type === 'orderForm' || type === 'payment' || type === 'trackOrder') {
      // functional sections: only their outer cards are built, never the changing form content
      return kind === 'card' && !el.parentElement?.closest('.glass');
    }
  }
  if (kind === 'button' && el.closest('form')) return false;
  return true;
}

/** Tight rectangle around the text lines of an element (excludes empty block width). */
function textBounds(el: HTMLElement): { left: number; top: number; width: number; height: number } | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent?.trim()) continue;
    range.selectNodeContents(n);
    for (const rc of Array.from(range.getClientRects())) {
      if (rc.width < 1) continue;
      l = Math.min(l, rc.left); t = Math.min(t, rc.top); r = Math.max(r, rc.right); b = Math.max(b, rc.bottom);
    }
  }
  return r > l ? { left: l, top: t, width: r - l, height: b - t } : null;
}

// ───────── overlay markup ─────────
const arrow = (c: string) =>
  `<span class="dm-bj-glyph" style="transform:translate(-2px,-2px)"><svg viewBox="0 0 20 24" width="19" height="23"><path d="M1.5 1.5V18.5L6 14.5L9 21.5L12.2 20.1L9.2 13.2H15.5Z" fill="${c}" stroke="#0b1020" stroke-width="1.4" stroke-linejoin="round"/></svg></span>`;
const ibeam = (c: string) =>
  `<span class="dm-bj-glyph" style="transform:translate(-6px,-11px)"><svg viewBox="0 0 12 22" width="12" height="22"><path d="M2.5 2H9.5M2.5 20H9.5M6 2V20" stroke="#0b1020" stroke-width="4" stroke-linecap="round" fill="none"/><path d="M2.5 2H9.5M2.5 20H9.5M6 2V20" stroke="${c}" stroke-width="2" stroke-linecap="round" fill="none"/></svg></span>`;

// Every interpolated value is a number computed from layout or a constant (palette colour, kind label):
// no page content or user input ever reaches this markup.
function markup(kind: BuildKind, color: { c: string; ink: string }, g: { x: number; y: number; w: number; h: number; rootW: number }): string {
  const reach = Math.min(g.y, 520);
  const guides = BIG.has(kind)
    ? `<i class="dm-bj-g" style="left:${-g.x}px;top:0;width:${g.rootW}px;height:1px"></i>` +
      `<i class="dm-bj-g" style="left:${-g.x}px;top:${g.h}px;width:${g.rootW}px;height:1px"></i>` +
      `<i class="dm-bj-g" style="left:0;top:${-reach}px;width:1px;height:${reach + g.h + 520}px"></i>` +
      `<i class="dm-bj-g" style="left:${g.w}px;top:${-reach}px;width:1px;height:${reach + g.h + 520}px"></i>`
    : '';
  return `${guides}<div class="dm-bj-box"><i class="dm-bj-h dm-bj-h-tl"></i><i class="dm-bj-h dm-bj-h-tr"></i><i class="dm-bj-h dm-bj-h-bl"></i><i class="dm-bj-h dm-bj-h-br"></i><b class="dm-bj-tag">0 × 0</b></div>` +
    `<div class="dm-bj-cur">${I_BEAM.has(kind) ? ibeam(color.c) : arrow(color.c)}<span class="dm-bj-name" style="background:${color.c};color:${color.ink}">${LABELS[kind]}</span></div>`;
}

// ───────── engine ─────────
export interface BuildStats { built: number; total: number; active: number }
type State = 'pending' | 'ready' | 'building' | 'done';
interface Item { el: HTMLElement; kind: BuildKind; state: State; top: number; left: number }
interface Job {
  item: Item; t0: number; ph: { a: number; b: number; c: number };
  w: number; h: number; clip: Box; e: { w: number; h: number }; m: number;
  from: { x: number; y: number };
  node: HTMLElement; box: HTMLElement; tag: HTMLElement; cur: HTMLElement; guides: HTMLElement[];
  revealed: boolean; tagText: string;
}

const MAX_ACTIVE = 12;

class Engine {
  private items = new Map<HTMLElement, Item>();
  private jobs: Job[] = [];
  private io: IntersectionObserver;
  private mo: MutationObserver;
  private raf = 0;
  private lastStart = 0;
  private built = 0;
  private counter = 0;
  private stopped = false;
  private lastKey = '';
  private lastEmit = 0;
  private root: HTMLElement;
  private ovl: HTMLElement;
  private speed: number;
  private onStats: (s: BuildStats) => void;

  constructor(root: HTMLElement, ovl: HTMLElement, speed: number, onStats: (s: BuildStats) => void) {
    this.root = root; this.ovl = ovl; this.speed = speed; this.onStats = onStats;
    this.io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const it = this.items.get(e.target as HTMLElement);
        if (it && it.state === 'pending') this.markReady(it);
      }
      this.kick();
    }, { rootMargin: '0px 0px -4% 0px', threshold: 0.02 });
    this.mo = new MutationObserver((records) => this.mutated(records));
  }

  start() {
    this.scan(this.root);
    this.mo.observe(this.root, { childList: true, subtree: true });
    this.kick();
  }

  setSpeed(s: number) { this.speed = s; }

  stop() {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    this.io.disconnect();
    this.mo.disconnect();
    for (const el of this.items.keys()) {
      delete el.dataset.build; delete el.dataset.kind; el.style.clipPath = '';
    }
    this.items.clear();
    this.jobs = [];
    this.ovl.replaceChildren();
  }

  /** Hides everything again and rebuilds the visible part of the page from the top. */
  replay() {
    for (const j of this.jobs) j.node.remove();
    this.jobs = [];
    this.built = 0;
    for (const [el, it] of this.items) {
      it.state = 'pending'; el.dataset.build = 'pending'; el.style.clipPath = ''; this.io.unobserve(el);
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    requestAnimationFrame(() => {
      if (this.stopped) return;
      for (const el of this.items.keys()) this.io.observe(el);
      this.kick();
    });
    this.kick();
  }

  // ── discovery ──
  private scan(node: Element) {
    if (node.matches(BUILD_SELECTOR)) this.register(node as HTMLElement);
    node.querySelectorAll<HTMLElement>(BUILD_SELECTOR).forEach((el) => this.register(el));
  }

  private register(el: HTMLElement) {
    if (this.items.has(el) || this.ovl.contains(el)) return;
    const kind = kindOf(el);
    if (!kind || !shouldBuild(el, kind)) return;
    this.items.set(el, { el, kind, state: 'pending', top: 0, left: 0 });
    el.dataset.build = 'pending'; // hides it before the first paint
    el.dataset.kind = kind;
    this.io.observe(el);
    this.kick();
  }

  private mutated(records: MutationRecord[]) {
    let removed = false;
    for (const r of records) {
      if (this.ovl.contains(r.target)) continue;
      r.addedNodes.forEach((n) => { if (n.nodeType === 1) this.scan(n as Element); });
      if (r.removedNodes.length) removed = true;
    }
    if (!removed) return;
    for (const [el, it] of this.items) {
      if (el.isConnected) continue;
      this.io.unobserve(el);
      this.items.delete(el);
      const at = this.jobs.findIndex((j) => j.item === it);
      if (at >= 0) { this.jobs[at].node.remove(); this.jobs.splice(at, 1); }
    }
    this.kick();
  }

  private markReady(it: Item) {
    it.state = 'ready';
    const r = it.el.getBoundingClientRect();
    it.top = r.top + window.scrollY;
    it.left = r.left;
    // a visible part needs its container built first
    for (let p = it.el.parentElement; p && p !== this.root; p = p.parentElement) {
      const parent = this.items.get(p);
      if (parent) { if (parent.state === 'pending') this.markReady(parent); break; }
    }
  }

  private parentBuilt(it: Item): boolean {
    for (let p = it.el.parentElement; p && p !== this.root; p = p.parentElement) {
      const parent = this.items.get(p);
      if (parent) return parent.state === 'done';
    }
    return true;
  }

  // ── scheduling ──
  private kick() {
    if (!this.raf && !this.stopped) this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    this.raf = 0;
    if (this.stopped) return;
    for (let i = this.jobs.length - 1; i >= 0; i--) {
      if (this.step(this.jobs[i], now)) { this.jobs[i].node.remove(); this.jobs.splice(i, 1); }
    }
    this.launch(now);
    const busy = this.jobs.length > 0 || this.hasReady();
    this.emit(now, !busy);
    if (busy) this.kick();
  };

  private hasReady(): boolean {
    for (const it of this.items.values()) if (it.state === 'ready') return true;
    return false;
  }

  private launch(now: number) {
    if (this.jobs.length >= MAX_ACTIVE || now - this.lastStart < 55 / this.speed) return;
    let best: Item | null = null;
    for (const it of this.items.values()) {
      if (it.state !== 'ready' || !this.parentBuilt(it)) continue;
      if (!best || it.top < best.top - 1 || (Math.abs(it.top - best.top) <= 1 && it.left < best.left)) best = it;
    }
    if (!best) return;
    this.lastStart = now;
    this.begin(best, now);
  }

  private begin(it: Item, now: number) {
    const el = it.el;
    const er = el.getBoundingClientRect();
    const onScreen = er.bottom > 0 && er.top < window.innerHeight;
    if (er.width < 2 || er.height < 2 || !onScreen) { this.reveal(it); return; }

    const rr = this.root.getBoundingClientRect();
    const tight = TIGHT_TEXT.has(it.kind) ? textBounds(el) : null;
    const b = tight ?? { left: er.left, top: er.top, width: er.width, height: er.height };
    const w = Math.max(2, b.width), h = Math.max(2, b.height);
    const x = b.left - rr.left, y = b.top - rr.top;
    const color = PALETTE[this.counter % PALETTE.length];
    const dir = [[-1, -1], [1, -1], [-1, 1], [1, 1]][this.counter++ % 4];
    const from = {
      x: (dir[0] < 0 ? 0 : w) + dir[0] * (90 + Math.random() * 170),
      y: (dir[1] < 0 ? 0 : h) + dir[1] * (70 + Math.random() * 130),
    };

    const node = document.createElement('div');
    node.className = 'dm-bj';
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    node.innerHTML = markup(it.kind, color, { x, y, w, h, rootW: rr.width });
    this.ovl.appendChild(node);

    const job: Job = {
      item: it, t0: now, ph: phases(this.speed, w, h), w, h,
      clip: { l: b.left - er.left, t: b.top - er.top, w, h }, e: { w: er.width, h: er.height }, m: tight ? 10 : 48, from,
      node, box: node.querySelector<HTMLElement>('.dm-bj-box')!, tag: node.querySelector<HTMLElement>('.dm-bj-tag')!,
      cur: node.querySelector<HTMLElement>('.dm-bj-cur')!, guides: Array.from(node.querySelectorAll<HTMLElement>('.dm-bj-g')),
      revealed: false, tagText: '',
    };
    it.state = 'building';
    el.dataset.build = 'drag';
    el.style.clipPath = clipInset(0, job.clip, job.e, job.m);
    this.jobs.push(job);
  }

  /** One animation frame of a job; returns true when the job is over. */
  private step(j: Job, now: number): boolean {
    const t = now - j.t0;
    const { a, b, c } = j.ph;
    let cx: number, cy: number, p = 0, curOp = 1, boxOp = 1, guideOp = 0;
    if (t < a) {
      const k = easeOut(clamp01(t / a));
      cx = j.from.x * (1 - k); cy = j.from.y * (1 - k);
      curOp = clamp01(t / (a * 0.45)); boxOp = 0;
    } else if (t < a + b) {
      p = easeInOut((t - a) / b);
      cx = p * j.w; cy = p * j.h;
      guideOp = 0.5 * clamp01((t - a) / (b * 0.4));
    } else {
      p = 1;
      const k = clamp01((t - a - b) / c);
      if (!j.revealed) { j.revealed = true; this.reveal(j.item); }
      const d = easeOut(k);
      cx = j.w + 22 * d; cy = j.h + 14 * d;
      boxOp = k < 0.3 ? 1 : 1 - (k - 0.3) / 0.7;
      curOp = k < 0.35 ? 1 : 1 - (k - 0.35) / 0.65;
      guideOp = 0.5 * (1 - clamp01(k * 2));
    }
    j.cur.style.transform = `translate(${cx.toFixed(1)}px,${cy.toFixed(1)}px)`;
    j.cur.style.opacity = curOp.toFixed(2);
    if (t >= a) {
      j.box.style.opacity = boxOp.toFixed(2);
      j.box.style.width = `${(p * j.w).toFixed(1)}px`;
      j.box.style.height = `${(p * j.h).toFixed(1)}px`;
      const text = `${Math.round(p * j.w)} × ${Math.round(p * j.h)}`;
      if (text !== j.tagText) { j.tagText = text; j.tag.textContent = text; }
      for (const g of j.guides) g.style.opacity = guideOp.toFixed(2);
      if (!j.revealed) j.item.el.style.clipPath = clipInset(p, j.clip, j.e, j.m);
    }
    return t >= a + b + c;
  }

  private reveal(it: Item) {
    it.el.style.clipPath = '';
    it.el.dataset.build = 'done';
    if (it.state !== 'done') { it.state = 'done'; this.built++; }
  }

  private emit(now: number, force: boolean) {
    const key = `${this.built}/${this.items.size}/${this.jobs.length}`;
    if (key === this.lastKey || (!force && now - this.lastEmit < 90)) return;
    this.lastKey = key;
    this.lastEmit = now;
    this.onStats({ built: this.built, total: this.items.size, active: this.jobs.length });
  }
}

// ───────── React wrapper + progress pill ─────────
let closedThisLoad = false; // "×" lasts until the page is reloaded
const SPEEDS = [1, 1.5, 2, 3];

function killSwitch(): boolean {
  try { return localStorage.getItem('devmart-build') === 'off'; } catch { return false; }
}
function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Mount as the LAST child of the page root: the overlay's parent is the root the engine watches. */
export function BuildEngine({ motion }: { motion: Theme['motion'] }) {
  const ovl = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const tour = useRef(0);
  const [stats, setStats] = useState<BuildStats>({ built: 0, total: 0, active: 0 });
  const [speed, setSpeed] = useState(motion.speed);
  const [closed, setClosed] = useState(closedThisLoad);
  const [touring, setTouring] = useState(false);
  const enabled = motion.build && !closed && !prefersReducedMotion() && !killSwitch();

  useEffect(() => setSpeed(motion.speed), [motion.speed]);
  useEffect(() => { engine.current?.setSpeed(speed); }, [speed]);

  // layout effect: parts are masked before the first paint, so nothing flashes in
  useLayoutEffect(() => {
    const root = ovl.current?.parentElement;
    if (!enabled || !root || !ovl.current) return;
    const e = new Engine(root, ovl.current, speed, setStats);
    engine.current = e;
    e.start();
    return () => { e.stop(); engine.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const stopTour = () => {
    cancelAnimationFrame(tour.current);
    tour.current = 0;
    setTouring(false);
  };
  useEffect(() => {
    if (!touring) return;
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      window.scrollBy({ top: (dt / 1000) * 300 * Math.sqrt(speed), behavior: 'instant' });
      const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
      if (atEnd) { setTouring(false); return; }
      tour.current = requestAnimationFrame(step);
    };
    tour.current = requestAnimationFrame(step);
    const halt = () => setTouring(false);
    const events = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;
    events.forEach((n) => window.addEventListener(n, halt, { passive: true }));
    return () => {
      cancelAnimationFrame(tour.current);
      events.forEach((n) => window.removeEventListener(n, halt));
    };
  }, [touring, speed]);

  const pct = stats.total ? Math.round((stats.built / stats.total) * 100) : 0;
  return (
    <>
      <div ref={ovl} className="dm-ovl" aria-hidden data-build-off />
      {enabled && motion.pill && stats.total > 0 && (
        <div className="dm-pill" role="group" aria-label="Page builder" data-build-off>
          <span className="dm-pill-dots" aria-hidden>{PALETTE.slice(0, 5).map((p) => <i key={p.c} style={{ background: p.c }} />)}</span>
          <span>{stats.active} {stats.active === 1 ? 'agent' : 'agents'}</span>
          <span className="dm-pill-sep" aria-hidden />
          <span>{stats.built} / {stats.total} layers</span>
          <span className="dm-pill-bar" aria-hidden><i style={{ width: `${pct}%` }} /></span>
          <button type="button" aria-label="Replay the build" onClick={() => { stopTour(); engine.current?.replay(); }}><RotateCcw size={13} aria-hidden /></button>
          <button type="button" aria-pressed={touring} onClick={() => (touring ? stopTour() : setTouring(true))}>
            {touring ? <><Square size={11} aria-hidden /> Stop</> : <><Play size={11} aria-hidden /> Tour</>}
          </button>
          <button type="button" aria-label={`Build speed ${speed} times, change`} onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 1.5)}>{speed}x</button>
          <button type="button" aria-label="Close builder and show the page" onClick={() => { stopTour(); closedThisLoad = true; setClosed(true); }}><X size={13} aria-hidden /></button>
        </div>
      )}
    </>
  );
}
