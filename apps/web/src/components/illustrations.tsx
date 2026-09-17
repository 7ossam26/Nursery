import { useId, type ReactNode, type SVGProps } from 'react';

/**
 * Decorative nursery illustrations. Every piece is inline SVG, aria-hidden and paints from the
 * `--art-*` palette in styles.css, so the same drawing reads as a bright classroom in light mode and
 * a calm night nursery in dark mode without a second asset. Motion lives in CSS classes
 * (`art-*`) so the global reduced-motion block neutralises it; nothing here re-renders on a timer.
 */

type ArtProps = Readonly<{ className?: string }> & Omit<SVGProps<SVGSVGElement>, 'className'>;

function Frame({ className = '', viewBox, children, ...props }: ArtProps & Readonly<{ viewBox: string; children: ReactNode }>) {
  return <svg className={`art ${className}`.trim()} viewBox={viewBox} fill="none" aria-hidden="true" focusable="false" {...props}>{children}</svg>;
}

/** Five-point star path centred on (cx, cy). Shared by every scene so stars keep one silhouette. */
export const starPath = (cx: number, cy: number, outer: number, inner = outer * 0.45): string => {
  const points: string[] = [];
  for (let index = 0; index < 10; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(2)} ${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return `M${points.join('L')}Z`;
};

const Star = ({ cx, cy, r, delay = 0, opacity = 1 }: Readonly<{ cx: number; cy: number; r: number; delay?: number; opacity?: number }>) =>
  <path className="art-star" d={starPath(cx, cy, r)} fill="var(--art-star)" opacity={opacity} style={{ animationDelay: `${delay}s` }} />;

// Placement lives on an outer group and motion on an inner one: a CSS transform animation replaces
// an element's transform attribute outright, so animating the placed group would snap it to the origin.
const Cloud = ({ x, y, scale = 1, className = '', opacity = 1 }: Readonly<{ x: number; y: number; scale?: number; className?: string; opacity?: number }>) =>
  <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={opacity}>
    <g className={className}>
      <g fill="var(--art-cloud)">
        <circle cx="26" cy="30" r="15" /><circle cx="48" cy="20" r="21" /><circle cx="74" cy="28" r="17" /><rect x="26" y="26" width="48" height="20" rx="10" />
      </g>
      <path d="M18 44h64" stroke="var(--art-cloud-shade)" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
    </g>
  </g>;

const Balloon = ({ x, y, fill, className = '', scale = 1 }: Readonly<{ x: number; y: number; fill: string; className?: string; scale?: number }>) =>
  <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <g className={className}>
      <ellipse cx="0" cy="0" rx="11" ry="14" fill={fill} />
      <path d="M-2.5 13.5 0 17.5l2.5-4z" fill={fill} />
      <path d="M0 17.5c-5 7 5 11 0 21" stroke="var(--art-ink)" strokeWidth="1.2" strokeLinecap="round" opacity="0.45" />
      <ellipse cx="-4" cy="-5.5" rx="2.6" ry="4.2" fill="#ffffff" opacity="0.4" transform="rotate(-22 -4 -5.5)" />
    </g>
  </g>;

/** Soft radial halo. The gradient id comes from useId so several scenes can share one document. */
function Glow({ cx, cy, r }: Readonly<{ cx: number; cy: number; r: number }>) {
  const id = useId();
  return <>
    <defs><radialGradient id={id}><stop offset="0%" stopColor="var(--art-orb-glow)" /><stop offset="55%" stopColor="var(--art-orb-glow)" stopOpacity="0.45" /><stop offset="100%" stopColor="var(--art-orb-glow)" stopOpacity="0" /></radialGradient></defs>
    <circle className="art-orb__glow" cx={cx} cy={cy} r={r} fill={`url(#${id})`} />
  </>;
}

const Orb = ({ cx, cy, r }: Readonly<{ cx: number; cy: number; r: number }>) =>
  <g className="art-orb">
    <Glow cx={cx} cy={cy} r={r * 2.1} />
    <circle cx={cx} cy={cy} r={r} fill="var(--art-orb)" />
    {/* Sun rays fade out and moon craters fade in as the theme changes; both share one disc. */}
    <g stroke="var(--art-orb)" strokeWidth={r * 0.14} strokeLinecap="round" style={{ opacity: 'calc(1 - var(--art-crescent))' }}>
      {Array.from({ length: 8 }, (_, index) => {
        const angle = (index * Math.PI) / 4;
        const from = r * 1.25; const to = r * 1.5;
        return <line key={index} x1={cx + from * Math.cos(angle)} y1={cy + from * Math.sin(angle)} x2={cx + to * Math.cos(angle)} y2={cy + to * Math.sin(angle)} />;
      })}
    </g>
    <g fill="var(--art-ink)" style={{ opacity: 'calc(var(--art-crescent) * 0.16)' }}>
      <circle cx={cx - r * 0.3} cy={cy - r * 0.2} r={r * 0.2} /><circle cx={cx + r * 0.3} cy={cy + r * 0.28} r={r * 0.14} /><circle cx={cx + r * 0.18} cy={cy - r * 0.42} r={r * 0.1} />
    </g>
  </g>;

const Blocks = ({ x, y, scale = 1 }: Readonly<{ x: number; y: number; scale?: number }>) =>
  <g className="art-blocks" transform={`translate(${x} ${y}) scale(${scale})`}>
    <rect x="0" y="26" width="24" height="24" rx="5" fill="var(--art-sky)" /><circle cx="12" cy="38" r="4.5" fill="var(--art-ink)" opacity="0.35" />
    <rect x="27" y="26" width="24" height="24" rx="5" fill="var(--art-mint)" /><path d="M39 32.5 45 44h-12z" fill="var(--art-ink)" opacity="0.35" />
    <rect x="13" y="0" width="24" height="24" rx="5" fill="var(--art-sun)" className="art-block-top" /><path d={starPath(25, 12, 6)} fill="var(--art-ink)" opacity="0.35" />
  </g>;

const Plant = ({ x, y, scale = 1 }: Readonly<{ x: number; y: number; scale?: number }>) =>
  <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <path d="M6 42h20l-2.5 14h-15z" fill="var(--art-pink)" />
    <path d="M4 40h24v5H4z" fill="var(--art-pink)" opacity="0.8" />
    <g className="art-sway" fill="var(--art-mint)" stroke="var(--art-ink)" strokeWidth="1" strokeOpacity="0.25">
      <path d="M16 42c0-12-9-18-13-24 8 0 15 6 13 24z" /><path d="M16 42c0-12 9-18 13-24-8 0-15 6-13 24z" /><path d="M16 42c-1-14 0-24 0-32 3 8 3 18 0 32z" />
    </g>
  </g>;

const Books = ({ x, y, scale = 1 }: Readonly<{ x: number; y: number; scale?: number }>) =>
  <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <rect x="0" y="28" width="56" height="12" rx="3" fill="var(--art-lavender)" /><rect x="6" y="16" width="52" height="12" rx="3" fill="var(--art-pink)" /><rect x="2" y="4" width="50" height="12" rx="3" fill="var(--art-sky)" />
    <g stroke="var(--art-ink)" strokeWidth="1.4" strokeLinecap="round" opacity="0.35"><path d="M8 34h18" /><path d="M14 22h18" /><path d="M10 10h18" /></g>
  </g>;

const Pencil = ({ x, y, rotate = -30, scale = 1 }: Readonly<{ x: number; y: number; rotate?: number; scale?: number }>) =>
  <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
    <rect x="0" y="0" width="10" height="44" rx="2" fill="var(--art-sun)" /><rect x="0" y="0" width="10" height="7" rx="2" fill="var(--art-pink)" />
    <path d="M0 44 5 54l5-10z" fill="var(--art-cloud-shade)" /><path d="M3 50 5 54l2-4z" fill="var(--art-ink)" opacity="0.6" />
    <path d="M5 8v34" stroke="var(--art-ink)" strokeWidth="1" opacity="0.25" />
  </g>;

const Bunting = ({ x, y, width }: Readonly<{ x: number; y: number; width: number }>) => {
  const colours = ['var(--art-pink)', 'var(--art-sky)', 'var(--art-sun)', 'var(--art-mint)', 'var(--art-lavender)'];
  const count = Math.max(3, Math.round(width / 22));
  const step = width / count;
  return <g transform={`translate(${x} ${y})`}>
    <path d={`M0 0q${width / 2} 18 ${width} 0`} stroke="var(--art-ink)" strokeWidth="1.2" opacity="0.4" />
    {Array.from({ length: count }, (_, index) => {
      const cx = step * index + step / 2; const cy = 2 + 12 * Math.sin((Math.PI * cx) / width);
      return <path key={index} d={`M${cx - 7} ${cy}h14l-7 14z`} fill={colours[index % colours.length]} />;
    })}
  </g>;
};

/* ---- Exported pieces ------------------------------------------------------ */

export function StarsArt({ className, ...props }: ArtProps) {
  return <Frame viewBox="0 0 160 80" className={`art--stars ${className ?? ''}`} {...props}>
    <Star cx={18} cy={30} r={7} opacity={0.9} /><Star cx={54} cy={14} r={4.5} delay={0.6} opacity={0.75} /><Star cx={92} cy={40} r={6} delay={1.2} /><Star cx={130} cy={18} r={5} delay={1.8} opacity={0.8} /><Star cx={146} cy={58} r={3.5} delay={2.4} opacity={0.7} /><Star cx={72} cy={64} r={3} delay={0.3} opacity={0.6} />
  </Frame>;
}

export function CloudArt({ className, ...props }: ArtProps) {
  return <Frame viewBox="0 0 100 50" className={`art--cloud ${className ?? ''}`} {...props}><Cloud x={0} y={0} className="art-drift" /></Frame>;
}

export function MoonArt({ className, ...props }: ArtProps) {
  return <Frame viewBox="0 0 120 120" className={`art--moon ${className ?? ''}`} {...props}><Orb cx={60} cy={60} r={30} /></Frame>;
}

export function BalloonArt({ className, ...props }: ArtProps) {
  return <Frame viewBox="0 0 120 100" className={`art--balloons ${className ?? ''}`} {...props}>
    <Balloon x={34} y={28} fill="var(--art-pink)" className="art-float" /><Balloon x={64} y={18} fill="var(--art-sky)" className="art-float art-float--late" /><Balloon x={90} y={34} fill="var(--art-sun)" className="art-float art-float--later" />
    <Star cx={14} cy={20} r={4} opacity={0.8} /><Star cx={108} cy={72} r={3.5} delay={1} opacity={0.7} />
  </Frame>;
}

export function BlocksArt({ className, ...props }: ArtProps) {
  return <Frame viewBox="0 0 120 80" className={`art--blocks ${className ?? ''}`} {...props}><Blocks x={18} y={14} scale={1.15} /><Star cx={96} cy={22} r={5} opacity={0.85} /><Star cx={104} cy={54} r={3.5} delay={1.4} opacity={0.7} /></Frame>;
}

export function BooksArt({ className, ...props }: ArtProps) {
  return <Frame viewBox="0 0 120 80" className={`art--books ${className ?? ''}`} {...props}><Books x={14} y={26} scale={1.1} /><Pencil x={86} y={14} rotate={28} scale={0.85} /><Star cx={100} cy={70} r={4} delay={0.8} opacity={0.75} /></Frame>;
}

export function TeddyBearArt({ className, ...props }: ArtProps) {
  return <Frame viewBox="0 0 120 120" className={`art--teddy ${className ?? ''}`} {...props}>
    <g className="art-nod">
      <g fill="var(--art-sun)"><circle cx="38" cy="34" r="11" /><circle cx="82" cy="34" r="11" /><circle cx="60" cy="48" r="27" /></g>
      <g fill="var(--art-pink)" opacity="0.8"><circle cx="38" cy="34" r="5.5" /><circle cx="82" cy="34" r="5.5" /></g>
      <ellipse cx="60" cy="58" rx="12" ry="9" fill="var(--art-cream)" />
      <g fill="var(--art-dark)"><circle cx="50" cy="45" r="2.6" /><circle cx="70" cy="45" r="2.6" /><ellipse cx="60" cy="55" rx="4" ry="2.8" /></g>
      <path d="M56 60q4 4 8 0" stroke="var(--art-dark)" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
    </g>
    <g fill="var(--art-sun)"><ellipse cx="60" cy="94" rx="24" ry="20" /><circle cx="32" cy="90" r="9" /><circle cx="88" cy="90" r="9" /></g>
    <ellipse cx="60" cy="98" rx="12" ry="10" fill="var(--art-cream)" opacity="0.9" />
    <path d="M48 74h24" stroke="var(--art-pink)" strokeWidth="6" strokeLinecap="round" />
    <Star cx={16} cy={24} r={4.5} opacity={0.85} /><Star cx={106} cy={68} r={3.5} delay={1.1} opacity={0.7} />
  </Frame>;
}

export function SchoolBusArt({ className, ...props }: ArtProps) {
  return <Frame viewBox="0 0 200 110" className={`art--bus ${className ?? ''}`} {...props}>
    <path className="art-road" d="M6 98h188" stroke="var(--art-ink)" strokeWidth="2" strokeLinecap="round" strokeDasharray="14 12" opacity="0.35" />
    <Cloud x={8} y={4} scale={0.5} opacity={0.9} className="art-drift" /><Star cx={172} cy={18} r={5} opacity={0.85} /><Star cx={150} cy={38} r={3} delay={1.3} opacity={0.7} />
    <g className="art-bob">
      <rect x="22" y="30" width="152" height="56" rx="12" fill="var(--art-sun)" />
      <rect x="22" y="62" width="152" height="6" fill="var(--art-ink)" opacity="0.22" />
      <path d="M160 30h4a10 10 0 0 1 10 10v36a10 10 0 0 1-10 10h-4z" fill="var(--art-sun)" />
      <g fill="var(--art-sky)"><rect x="34" y="40" width="22" height="16" rx="4" /><rect x="64" y="40" width="22" height="16" rx="4" /><rect x="94" y="40" width="22" height="16" rx="4" /><rect x="124" y="40" width="22" height="16" rx="4" /><rect x="154" y="40" width="14" height="16" rx="4" /></g>
      <rect x="40" y="70" width="10" height="14" rx="2" fill="var(--art-ink)" opacity="0.2" />
      <circle cx="171" cy="76" r="3.5" fill="var(--art-cream)" /><circle cx="27" cy="76" r="3" fill="var(--art-pink)" />
      <g className="art-wheel"><circle cx="58" cy="88" r="10" fill="var(--art-ink)" /><circle cx="58" cy="88" r="4" fill="var(--art-cloud)" /><path d="M58 80v4m0 8v4m-8-8h4m8 0h4" stroke="var(--art-cloud)" strokeWidth="1.5" opacity="0.5" /></g>
      <g className="art-wheel"><circle cx="140" cy="88" r="10" fill="var(--art-ink)" /><circle cx="140" cy="88" r="4" fill="var(--art-cloud)" /><path d="M140 80v4m0 8v4m-8-8h4m8 0h4" stroke="var(--art-cloud)" strokeWidth="1.5" opacity="0.5" /></g>
    </g>
  </Frame>;
}

export function ClassroomArt({ className, ...props }: ArtProps) {
  return <Frame viewBox="0 0 200 120" className={`art--classroom ${className ?? ''}`} {...props}>
    <path d="M10 110h180" stroke="var(--art-ground)" strokeWidth="4" strokeLinecap="round" />
    <g><rect x="60" y="18" width="80" height="54" rx="6" fill="var(--art-mint)" /><rect x="60" y="18" width="80" height="54" rx="6" stroke="var(--art-ink)" strokeOpacity="0.25" strokeWidth="2" />
      <g stroke="var(--art-cloud)" strokeWidth="2.5" strokeLinecap="round" opacity="0.9"><path d="M74 36h30" /><path d="M74 48h44" /><path d="M74 60h22" /></g>
      <path d="M78 72 68 108M122 72l10 36" stroke="var(--art-ink)" strokeWidth="3" strokeLinecap="round" opacity="0.4" /></g>
    <Blocks x={14} y={58} scale={0.95} /><Plant x={156} y={54} /><Books x={132} y={82} scale={0.55} />
    <Star cx={30} cy={24} r={5} opacity={0.85} /><Star cx={176} cy={30} r={4} delay={1} opacity={0.75} /><Star cx={160} cy={12} r={2.5} delay={2} opacity={0.6} />
  </Frame>;
}

export function ChildrenArt({ className, ...props }: ArtProps) {
  return <Frame viewBox="0 0 200 120" className={`art--children ${className ?? ''}`} {...props}>
    <path d="M14 110h172" stroke="var(--art-ground)" strokeWidth="4" strokeLinecap="round" />
    {/* Two paper-cut figures reading together: heads, rounded bodies and a shared open book. */}
    <g className="art-nod"><circle cx="66" cy="44" r="16" fill="var(--art-pink)" /><path d="M50 44a16 16 0 0 1 32 0c-6-6-10-8-16-8s-10 2-16 8z" fill="var(--art-ink)" opacity="0.55" /></g>
    <path d="M40 108c0-24 10-40 26-40s26 16 26 40z" fill="var(--art-sky)" />
    <g className="art-nod art-nod--late"><circle cx="134" cy="44" r="16" fill="var(--art-lavender)" /><path d="M118 42a16 16 0 0 1 32 2c-2-8-8-10-16-10s-14 2-16 8z" fill="var(--art-ink)" opacity="0.55" /></g>
    <path d="M108 108c0-24 10-40 26-40s26 16 26 40z" fill="var(--art-mint)" />
    <g><path d="M72 84c10-6 20-6 28 0 8-6 18-6 28 0v22c-10-5-20-5-28 0-8-5-18-5-28 0z" fill="var(--art-cloud)" stroke="var(--art-ink)" strokeOpacity="0.35" strokeWidth="2" strokeLinejoin="round" /><path d="M100 84v22" stroke="var(--art-ink)" strokeOpacity="0.35" strokeWidth="2" />
      <g stroke="var(--art-ink)" strokeWidth="1.5" strokeLinecap="round" opacity="0.3"><path d="M80 92h14M80 98h10M106 92h14M106 98h10" /></g></g>
    <Star cx={24} cy={30} r={5} opacity={0.85} /><Star cx={178} cy={22} r={4.5} delay={0.9} opacity={0.75} /><Star cx={100} cy={16} r={3} delay={1.7} opacity={0.65} />
    <Cloud x={150} y={44} scale={0.34} opacity={0.9} className="art-drift" />
  </Frame>;
}

export function CalendarArt({ className, ...props }: ArtProps) {
  return <Frame viewBox="0 0 160 120" className={`art--calendar ${className ?? ''}`} {...props}>
    <rect x="34" y="20" width="92" height="84" rx="10" fill="var(--art-cloud)" stroke="var(--art-ink)" strokeOpacity="0.25" strokeWidth="2" />
    <path d="M34 30a10 10 0 0 1 10-10h72a10 10 0 0 1 10 10v14H34z" fill="var(--art-pink)" />
    <g stroke="var(--art-ink)" strokeWidth="3" strokeLinecap="round" opacity="0.55"><path d="M56 14v14M104 14v14" /></g>
    <g fill="var(--art-ink)" opacity="0.18"><circle cx="54" cy="60" r="4" /><circle cx="80" cy="60" r="4" /><circle cx="106" cy="60" r="4" /><circle cx="54" cy="82" r="4" /><circle cx="106" cy="82" r="4" /></g>
    <circle cx="80" cy="82" r="11" fill="var(--art-mint)" /><path className="art-check" d="m74 82 4 4 8-8" stroke="var(--art-ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    <Star cx={20} cy={40} r={5.5} opacity={0.85} /><Star cx={142} cy={92} r={4} delay={1.2} opacity={0.75} /><Star cx={138} cy={30} r={3} delay={2} opacity={0.6} />
    <Cloud x={2} y={80} scale={0.3} opacity={0.9} className="art-drift" />
  </Frame>;
}

export function NotificationsArt({ className, ...props }: ArtProps) {
  return <Frame viewBox="0 0 160 120" className={`art--notifications ${className ?? ''}`} {...props}>
    <g className="art-float"><Glow cx={112} cy={40} r={48} /><path d="M120 12a28 28 0 1 0 12 50 22 22 0 1 1-12-50z" fill="var(--art-orb)" /></g>
    <g className="art-swing"><path d="M40 84a22 22 0 0 1 44 0v6l6 8H34l6-8z" fill="var(--art-sun)" /><path d="M56 100a6 6 0 0 0 12 0z" fill="var(--art-ink)" opacity="0.55" /><circle cx="62" cy="58" r="3" fill="var(--art-ink)" opacity="0.45" /></g>
    <Star cx={20} cy={30} r={5.5} opacity={0.85} /><Star cx={64} cy={22} r={3.5} delay={0.8} opacity={0.7} /><Star cx={146} cy={90} r={4} delay={1.6} opacity={0.75} />
  </Frame>;
}

export function ReportArt({ className, ...props }: ArtProps) {
  return <Frame viewBox="0 0 160 120" className={`art--report ${className ?? ''}`} {...props}>
    <rect x="46" y="22" width="76" height="86" rx="8" fill="var(--art-cloud-shade)" transform="rotate(6 84 65)" />
    <rect x="38" y="14" width="76" height="90" rx="8" fill="var(--art-cloud)" stroke="var(--art-ink)" strokeOpacity="0.25" strokeWidth="2" />
    <path d="M96 14v14a4 4 0 0 0 4 4h14" stroke="var(--art-ink)" strokeOpacity="0.25" strokeWidth="2" fill="none" />
    <g className="art-bars"><rect x="50" y="66" width="12" height="26" rx="3" fill="var(--art-sky)" /><rect x="68" y="50" width="12" height="42" rx="3" fill="var(--art-lavender)" /><rect x="86" y="58" width="12" height="34" rx="3" fill="var(--art-mint)" /></g>
    <path d="M50 42l16-8 16 6 16-14" stroke="var(--art-pink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <Books x={2} y={78} scale={0.6} />
    <Star cx={136} cy={30} r={5} opacity={0.85} /><Star cx={146} cy={70} r={3.5} delay={1.2} opacity={0.7} />
  </Frame>;
}

export function PlaygroundArt({ className, ...props }: ArtProps) {
  return <Frame viewBox="0 0 200 120" className={`art--playground ${className ?? ''}`} {...props}>
    <Bunting x={20} y={16} width={160} />
    <path d="M10 110h180" stroke="var(--art-ground)" strokeWidth="4" strokeLinecap="round" />
    <Balloon x={44} y={62} fill="var(--art-pink)" className="art-float" /><Balloon x={70} y={52} fill="var(--art-sky)" className="art-float art-float--late" />
    <path d="M110 104V54a12 12 0 0 1 24 0v50" stroke="var(--art-lavender)" strokeWidth="6" strokeLinecap="round" fill="none" />
    <path d="M134 104V48a12 12 0 0 1 24 0v56" stroke="var(--art-mint)" strokeWidth="6" strokeLinecap="round" fill="none" />
    <circle cx="176" cy="96" r="10" fill="var(--art-sun)" /><path d="M170 89a10 10 0 0 1 12 14" stroke="var(--art-ink)" strokeWidth="1.5" opacity="0.35" fill="none" />
    <Star cx={184} cy={56} r={4.5} opacity={0.85} /><Star cx={100} cy={38} r={3} delay={1.4} opacity={0.65} />
  </Frame>;
}

/** A tiny four-point spark for success moments and card corners. */
export function Sparkle({ className, ...props }: ArtProps) {
  return <Frame viewBox="0 0 24 24" className={`art--sparkle ${className ?? ''}`} {...props}>
    <path className="art-sparkle__main" d="M12 2c.6 5.4 4.6 9.4 10 10-5.4.6-9.4 4.6-10 10-.6-5.4-4.6-9.4-10-10 5.4-.6 9.4-4.6 10-10z" fill="currentColor" />
    <path className="art-sparkle__minor" d="M19 15c.2 2 1.8 3.6 3.8 3.8-2 .2-3.6 1.8-3.8 3.8-.2-2-1.8-3.6-3.8-3.8 2-.2 3.6-1.8 3.8-3.8z" fill="currentColor" opacity="0.7" />
  </Frame>;
}

/**
 * The hero composition: sky, orb, drifting clouds, twinkling stars, balloons, and a small cluster of
 * classroom objects on the ground. `compact` keeps the sky only, for page banners; `landing` spreads
 * the same pieces wide behind the sign-in card.
 */
export function NurseryScene({ variant = 'hero', className, ...props }: ArtProps & Readonly<{ variant?: 'hero' | 'compact' | 'landing' }>) {
  if (variant === 'landing') {
    return <Frame viewBox="0 0 900 520" className={`art--scene art--scene-landing ${className ?? ''}`} preserveAspectRatio="xMidYMid slice" {...props}>
      <Orb cx={760} cy={96} r={54} />
      <Cloud x={40} y={60} scale={1.8} opacity={0.95} className="art-drift" /><Cloud x={600} y={170} scale={1.2} opacity={0.9} className="art-drift art-drift--slow" /><Cloud x={260} y={400} scale={1} opacity={0.8} className="art-drift art-drift--late" />
      <Star cx={120} cy={170} r={13} opacity={0.9} /><Star cx={330} cy={80} r={9} delay={0.7} opacity={0.75} /><Star cx={560} cy={60} r={10} delay={1.4} /><Star cx={840} cy={250} r={9} delay={2.1} opacity={0.8} /><Star cx={210} cy={300} r={7} delay={0.4} opacity={0.7} /><Star cx={690} cy={330} r={8} delay={1.8} opacity={0.75} /><Star cx={480} cy={470} r={6} delay={2.6} opacity={0.6} />
      <Balloon x={96} y={396} fill="var(--art-pink)" className="art-float" scale={2} /><Balloon x={156} y={352} fill="var(--art-sky)" className="art-float art-float--late" scale={1.7} />
      <Balloon x={826} y={396} fill="var(--art-lavender)" className="art-float art-float--later" scale={1.8} />
      <Blocks x={660} y={410} scale={2} /><Plant x={30} y={190} scale={1.5} /><Books x={760} y={250} scale={1.4} /><Pencil x={600} y={430} rotate={-28} scale={1.2} />
      <g className="art-particles" fill="var(--art-cyan)"><circle cx="400" cy="140" r="3" /><circle cx="150" cy="500" r="2.5" /><circle cx="600" cy="480" r="3" /><circle cx="880" cy="150" r="2" /><circle cx="300" cy="230" r="2" /></g>
    </Frame>;
  }
  if (variant === 'compact') {
    return <Frame viewBox="0 0 240 120" className={`art--scene art--scene-compact ${className ?? ''}`} preserveAspectRatio="xMaxYMid meet" {...props}>
      <Orb cx={186} cy={40} r={22} />
      <Cloud x={20} y={16} scale={0.55} opacity={0.95} className="art-drift" /><Cloud x={110} y={62} scale={0.45} opacity={0.85} className="art-drift art-drift--slow" />
      <Star cx={24} cy={90} r={5} opacity={0.85} /><Star cx={98} cy={30} r={4} delay={0.8} opacity={0.75} /><Star cx={150} cy={104} r={3.5} delay={1.6} opacity={0.7} /><Star cx={226} cy={92} r={3} delay={2.2} opacity={0.65} />
      <Balloon x={72} y={88} fill="var(--art-pink)" className="art-float" />
    </Frame>;
  }
  return <Frame viewBox="0 0 400 240" className={`art--scene art--scene-hero ${className ?? ''}`} preserveAspectRatio="xMaxYMin meet" {...props}>
    <Orb cx={320} cy={62} r={34} />
    <Cloud x={30} y={26} scale={0.8} opacity={0.95} className="art-drift" /><Cloud x={210} y={110} scale={0.6} opacity={0.9} className="art-drift art-drift--slow" /><Cloud x={110} y={150} scale={0.45} opacity={0.8} className="art-drift art-drift--late" />
    <Star cx={40} cy={110} r={7} opacity={0.9} /><Star cx={150} cy={40} r={5} delay={0.7} opacity={0.75} /><Star cx={228} cy={22} r={6} delay={1.4} /><Star cx={372} cy={140} r={5.5} delay={2.1} opacity={0.8} /><Star cx={190} cy={96} r={4} delay={0.4} opacity={0.7} /><Star cx={286} cy={168} r={4} delay={1.8} opacity={0.7} />
    <Balloon x={66} y={188} fill="var(--art-pink)" className="art-float" scale={1.25} /><Balloon x={104} y={170} fill="var(--art-sky)" className="art-float art-float--late" scale={1.1} />
    <path d="M150 236h236" stroke="var(--art-ground)" strokeWidth="4" strokeLinecap="round" opacity="0.9" />
    <Blocks x={306} y={168} scale={1.3} /><Plant x={252} y={158} scale={1.35} /><Books x={158} y={190} scale={0.85} /><Pencil x={224} y={182} rotate={24} scale={0.8} />
    <g className="art-particles" fill="var(--art-cyan)"><circle cx="120" cy="80" r="2.5" /><circle cx="260" cy="60" r="2" /><circle cx="350" cy="200" r="2.5" /><circle cx="30" cy="180" r="2" /><circle cx="200" cy="140" r="1.8" /></g>
  </Frame>;
}

/** Fixed, very faint sky behind every signed-in screen so each destination shares the same world. */
export function ShellBackdrop() {
  return <Frame viewBox="0 0 1440 900" className="shell-backdrop" preserveAspectRatio="xMidYMid slice">
    <Cloud x={-20} y={120} scale={1.6} opacity={0.7} className="art-drift art-drift--slow" /><Cloud x={1160} y={640} scale={1.2} opacity={0.6} className="art-drift art-drift--late" /><Cloud x={760} y={40} scale={0.8} opacity={0.5} className="art-drift" />
    <Star cx={220} cy={520} r={7} opacity={0.7} /><Star cx={1300} cy={160} r={9} delay={0.9} opacity={0.8} /><Star cx={980} cy={780} r={6} delay={1.7} opacity={0.6} /><Star cx={560} cy={860} r={5} delay={2.4} opacity={0.55} /><Star cx={1100} cy={430} r={5} delay={0.3} opacity={0.6} /><Star cx={80} cy={820} r={6} delay={1.2} opacity={0.6} />
    <g className="art-particles" fill="var(--art-cyan)"><circle cx="400" cy="300" r="3" /><circle cx="1240" cy="520" r="3" /><circle cx="700" cy="620" r="2.5" /></g>
  </Frame>;
}
