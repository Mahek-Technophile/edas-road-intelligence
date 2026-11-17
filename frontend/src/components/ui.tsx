import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function PageHeader({ eyebrow, title, copy, actions }: { eyebrow: string; title: string; copy: string; actions?: ReactNode }) {
  return <div className="page-heading">
    <div>
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{copy}</p>
    </div>
    {actions && <div className="heading-actions">{actions}</div>}
  </div>;
}

export function Panel({ children, className = '', title, eyebrow, action }: { children: ReactNode; className?: string; title?: string; eyebrow?: string; action?: ReactNode }) {
  return <section className={`panel ${className}`}>
    {(title || action) && <div className="panel-head">
      <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}{title && <h2>{title}</h2>}</div>
      {action}
    </div>}
    {children}
  </section>;
}

export function Badge({ children, tone = 'slate', dot = false }: { children: ReactNode; tone?: string; dot?: boolean }) {
  return <span className={`badge badge-${tone}`}>{dot && <i />}{children}</span>;
}

export function Stat({ label, value, unit, foot, tone = 'green', icon, delta }: { label: string; value: string | number; unit?: string; foot: string; tone?: string; icon: IconName; delta?: string }) {
  return <article className="stat-card">
    <div className="stat-top"><span>{label}</span><span className={`stat-icon ${tone}`}><Icon name={icon} size={17} /></span></div>
    <div className="stat-value">{value}{unit && <small>{unit}</small>}</div>
    <div className="stat-foot"><span>{foot}</span>{delta && <Badge tone={tone === 'red' ? 'red' : 'green'}>{delta}</Badge>}</div>
  </article>;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string; count?: number }>; onChange: (value: T) => void; label: string }) {
  return <div className="segmented" role="group" aria-label={label}>{options.map((option) => <button key={option.value} className={value === option.value ? 'active' : ''} onClick={() => onChange(option.value)}>{option.label}{option.count !== undefined && <span>{option.count}</span>}</button>)}</div>;
}

export function Meter({ value, tone = 'green', label }: { value: number; tone?: string; label?: string }) {
  return <div className={`meter-wrap ${label ? 'has-label' : ''}`}>
    {label && <span className="meter-label">{label}</span>}
    <div className={`meter meter-${tone}`}><i style={{ width: `${Math.max(2, Math.min(100, value))}%` }} /></div>
    <span className="meter-value">{Math.round(value)}%</span>
  </div>;
}

export function Sparkline({ points, tone = '#2c6c4f', height = 46, fill = true }: { points: number[]; tone?: string; height?: number; fill?: boolean }) {
  const width = 240;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const spread = max - min || 1;
  const coords = points.map((point, index) => [10 + (index * (width - 20)) / Math.max(1, points.length - 1), height - 6 - ((point - min) / spread) * (height - 16)]);
  const line = coords.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords[coords.length - 1][0]} ${height} L${coords[0][0]} ${height} Z`;
  const id = `spark-${tone.replace('#', '')}`;
  return <svg viewBox={`0 0 ${width} ${height}`} className="sparkline" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={tone} stopOpacity=".22" /><stop offset="100%" stopColor={tone} stopOpacity="0" /></linearGradient></defs>
    {fill && <path d={area} fill={`url(#${id})`} />}
    <path d={line} fill="none" stroke={tone} strokeWidth="2" strokeLinecap="round" />
    <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r="3" fill={tone} />
  </svg>;
}

export function DuoBars({ data, height = 150 }: { data: Array<{ label: string; primary: number; secondary: number }>; height?: number }) {
  const max = Math.max(...data.flatMap((item) => [item.primary, item.secondary]), 1);
  return <div className="duo-bars" style={{ height }}>
    {data.map((item) => <div className="duo-col" key={item.label}>
      <div className="duo-stack">
        <span className="duo-bar primary" style={{ height: `${(item.primary / max) * 100}%` }}><i>{item.primary}</i></span>
        <span className="duo-bar secondary" style={{ height: `${(item.secondary / max) * 100}%` }} />
      </div>
      <span className="duo-label">{item.label}</span>
    </div>)}
  </div>;
}

export function Donut({ segments, total, caption }: { segments: Array<{ label: string; value: number; colour: string }>; total: number; caption: string }) {
  let offset = 0;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  return <div className="donut-wrap">
    <svg viewBox="0 0 140 140" className="donut" aria-hidden="true">
      <circle cx="70" cy="70" r={radius} fill="none" stroke="#eef1eb" strokeWidth="16" />
      {segments.map((segment) => {
        const length = total ? (segment.value / total) * circumference : 0;
        const dash = `${length} ${circumference - length}`;
        const element = <circle key={segment.label} cx="70" cy="70" r={radius} fill="none" stroke={segment.colour} strokeWidth="16" strokeDasharray={dash} strokeDashoffset={-offset} transform="rotate(-90 70 70)" strokeLinecap="butt" />;
        offset += length;
        return element;
      })}
      <text x="70" y="66" textAnchor="middle" className="donut-number">{total}</text>
      <text x="70" y="84" textAnchor="middle" className="donut-caption">{caption}</text>
    </svg>
    <div className="donut-legend">{segments.map((segment) => <div key={segment.label}><span className="legend-swatch" style={{ background: segment.colour }} /><span>{segment.label}</span><b>{segment.value}</b></div>)}</div>
  </div>;
}

export function WorkflowRibbon({ stages, active, compact = false }: { stages: Array<{ short: string }>; active: number; compact?: boolean }) {
  return <div className={`workflow-ribbon ${compact ? 'compact' : ''}`}>
    {stages.map((stage, index) => <div key={stage.short} className={`workflow-step ${index < active ? 'done' : ''} ${index === active ? 'current' : ''}`}>
      <span className="workflow-dot">{index < active ? '✓' : index + 1}</span>
      <span>{stage.short}</span>
      {index < stages.length - 1 && <i className="workflow-line" />}
    </div>)}
  </div>;
}

export function EmptyState({ title, copy, icon = 'target', action }: { title: string; copy: string; icon?: IconName; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name={icon} size={22} /></span><strong>{title}</strong><p>{copy}</p>{action}</div>;
}
