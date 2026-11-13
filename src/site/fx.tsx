// Decorative effects: drifting cursors and the CSS 3D sculpture (the cursor-built entrance lives in builder.tsx). All are aria-hidden and disabled for reduced motion.

const CURSOR_COLORS = ['#ffd24a', '#ff7a90', '#7dd3fc', '#a78bfa', '#5eead4', '#fb923c'];

export function Cursor({ color, className, style }: { color: string; className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden>
      <path d="M4 3l15 7.500-6.200 2.100L10.500 19z" fill={color} stroke="#0b0d12" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
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
