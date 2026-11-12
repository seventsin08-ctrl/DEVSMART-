// Decorative effects: the "assemble" entrance (selection box + size tag + cursors),
// drifting cursors and the CSS 3D sculpture. All are aria-hidden and disabled for reduced motion.
import { useInView } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '@/lib/utils';

const CURSOR_COLORS = ['#ffd24a', '#ff7a90', '#7dd3fc', '#a78bfa', '#5eead4', '#fb923c'];

export function Cursor({ color, className, style }: { color: string; className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden>
      <path d="M4 3l15 7.500-6.200 2.100L10.500 19z" fill={color} stroke="#0b0d12" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

/** Wraps content; when it scrolls into view a selection box "places" it, then it fades in. */
export function Assemble({ children, disabled, seed = 0 }: { children: ReactNode; disabled?: boolean; seed?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const [size, setSize] = useState('');
  useEffect(() => {
    if (inView && ref.current) setSize(`${Math.round(ref.current.offsetWidth)} × ${Math.round(ref.current.offsetHeight)}`);
  }, [inView]);
  if (disabled) return <>{children}</>;
  return (
    <div ref={ref} className={cx('dm-asm', inView && 'in')}>
      <div className="dm-asm-box" aria-hidden><i /><i /><i /><i /><b>{size}</b></div>
      <Cursor className="dm-cursor" color={CURSOR_COLORS[seed % CURSOR_COLORS.length]} />
      <Cursor className="dm-cursor" color={CURSOR_COLORS[(seed + 3) % CURSOR_COLORS.length]} />
      <div className="dm-asm-content">{children}</div>
    </div>
  );
}

const DRIFT = [
  { left: '6%', top: '78%', dx: 40, dy: -26, d: 0 }, { left: '38%', top: '70%', dx: -30, dy: 18, d: -3 },
  { left: '58%', top: '18%', dx: 26, dy: 30, d: -5 }, { left: '92%', top: '30%', dx: -34, dy: 22, d: -2 },
  { left: '84%', top: '82%', dx: -22, dy: -30, d: -6 }, { left: '48%', top: '44%', dx: 34, dy: 14, d: -4 },
];
export function DriftingCursors() {
  return (
    <div className="pointer-events-none absolute inset-0 hidden sm:block" aria-hidden>
      {DRIFT.map((c, i) => (
        <Cursor key={i} color={CURSOR_COLORS[i]} className="dm-drift"
          style={{ left: c.left, top: c.top, animationDelay: `${c.d}s`, ['--dx' as string]: `${c.dx}px`, ['--dy' as string]: `${c.dy}px` }} />
      ))}
    </div>
  );
}

export function Sculpture() {
  return (
    <div className="dm-sculpt dm-float" aria-hidden>
      <div className="dm-sculpt-glow" />
      <div className="dm-sculpt-spin">
        <div className="dm-pillar" />
        <div className="dm-ring r1" /><div className="dm-ring r2" /><div className="dm-ring r3" />
        <div className="dm-ball" style={{ left: '12%', top: '46%', transform: 'translateZ(60px)' }} />
        <div className="dm-ball" style={{ right: '10%', top: '34%', transform: 'translateZ(-50px)' }} />
        <div className="dm-ball" style={{ left: '44%', bottom: '6%', transform: 'translateZ(90px)' }} />
        <div className="dm-ball" style={{ right: '26%', bottom: '24%', transform: 'translateZ(-90px)', width: '8%' }} />
      </div>
    </div>
  );
}
