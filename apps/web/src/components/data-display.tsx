import { useId, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon.js';
import { useCountUp } from '../motion/hooks.js';
import { BalloonArt, CalendarArt, ChildrenArt, ClassroomArt, NotificationsArt, PlaygroundArt, ReportArt, SchoolBusArt, StarsArt } from './illustrations.js';

/**
 * A single real figure the screen already fetched. `value` is rendered verbatim, so formatted values
 * (EGP amounts, ratios, dates) keep their exact presentation; `countTo` opts a plain integer into the
 * count-up ramp. Nothing here derives, extrapolates or compares a number on its own.
 */
export function StatCard({ label, value, countTo, meta, icon, tone = 'accent', numeric = false }: Readonly<{
  label: string;
  value: ReactNode;
  countTo?: number;
  meta?: ReactNode;
  icon?: IconName;
  tone?: 'accent' | 'cyan' | 'violet' | 'magenta' | 'success' | 'warning';
  numeric?: boolean;
}>) {
  const counted = useCountUp(countTo ?? 0);
  return <div className={`stat-card stat-card--${tone}`}>
    <div className="stat-card__head">
      {icon && <span className="stat-card__icon">{<Icon name={icon} />}</span>}
      <span>{label}</span>
    </div>
    <strong className={`stat-card__value ${numeric ? 'numeric' : ''}`}>{countTo === undefined ? value : counted}</strong>
    {meta !== undefined && meta !== null && <span className="stat-card__meta">{meta}</span>}
  </div>;
}

export function StatGrid({ children, label }: Readonly<{ children: ReactNode; label: string }>) {
  return <section className="stat-grid" aria-label={label}>{children}</section>;
}

export function Badge({ children, tone = 'neutral', icon }: Readonly<{ children: ReactNode; tone?: 'neutral' | 'count' | 'success' | 'warning' | 'danger' | 'info'; icon?: IconName }>) {
  return <span className={`badge badge--${tone}`}>{icon && <Icon name={icon} />}{children}</span>;
}

/** Initials for a real person's name. Decorative: the name itself is always rendered beside it. */
export function Avatar({ name, large = false, tone = 'accent' }: Readonly<{ name: string; large?: boolean; tone?: 'accent' | 'child' }>) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => [...part][0] ?? '').join('');
  return <span className={`avatar avatar--${tone} ${large ? 'avatar--large' : ''}`.trim()} aria-hidden="true">{initials}</span>;
}

/** Stars-and-moon mark used for empty and welcome states. Purely decorative. */
export function SkyArt({ className = '' }: Readonly<{ className?: string }>) {
  return <svg className={className} viewBox="0 0 160 120" fill="none" aria-hidden="true" focusable="false">
    <circle className="hero__moon" cx="118" cy="34" r="17" stroke="currentColor" strokeWidth="2" opacity="0.75" />
    <path className="hero__cloud" d="M34 78h52a13 13 0 0 0 0-26 18 18 0 0 0-34-6 14 14 0 0 0-18 32Z" stroke="currentColor" strokeWidth="2" opacity="0.55" />
    <path className="hero__star" d="m26 24 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8Z" fill="currentColor" opacity="0.7" />
    <path className="hero__star" d="m74 16 1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6Z" fill="currentColor" opacity="0.55" />
    <path className="hero__star" d="m140 76 1.5 3 3.3.5-2.4 2.3.6 3.3-3-1.6-3 1.6.6-3.3-2.4-2.3 3.3-.5Z" fill="currentColor" opacity="0.5" />
    <path className="hero__star" d="m14 96 1.3 2.6 2.9.4-2.1 2 .5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.1-2 2.9-.4Z" fill="currentColor" opacity="0.45" />
  </svg>;
}

/** Scenes an empty state can open on. Each is decorative; the message still carries the meaning. */
export type EmptyStateArt = 'sky' | 'children' | 'classroom' | 'attendance' | 'transport' | 'activities' | 'reports' | 'notifications' | 'balloons';

const emptyStateArt: Record<EmptyStateArt, () => ReactNode> = {
  sky: () => <SkyArt className="empty-state__art" />,
  children: () => <ChildrenArt className="empty-state__art" />,
  classroom: () => <ClassroomArt className="empty-state__art" />,
  attendance: () => <CalendarArt className="empty-state__art" />,
  transport: () => <SchoolBusArt className="empty-state__art" />,
  activities: () => <PlaygroundArt className="empty-state__art" />,
  reports: () => <ReportArt className="empty-state__art" />,
  notifications: () => <NotificationsArt className="empty-state__art" />,
  balloons: () => <BalloonArt className="empty-state__art" />
};

/**
 * The shared "there is genuinely nothing here" surface. Screens use it instead of fabricating
 * placeholder rows when an authorised query returns no records. The scene is chosen by the caller
 * so a roster, a bus list and a report each open on their own small illustration; the copy is
 * always the screen's existing localised message.
 */
export function EmptyState({ title, body, action, art = 'sky' }: Readonly<{ title: string; body?: string; action?: ReactNode; art?: EmptyStateArt }>) {
  const titleId = useId();
  return <section className={`empty-state empty-state--${art}`} aria-labelledby={titleId}>
    <div className="empty-state__scene"><StarsArt className="empty-state__stars" />{emptyStateArt[art]()}</div>
    <h2 id={titleId}>{title}</h2>
    {body && <p>{body}</p>}
    {action}
  </section>;
}

export function PageHeader({ eyebrow, title, description, actions, art, icon }: Readonly<{
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  icon?: IconName;
  /** Small decorative scene beside the title; purely visual, so it never replaces the description. */
  art?: ReactNode;
}>) {
  return <header className={`page-header ${art ? 'page-header--illustrated' : ''}`.trim()}>
    {icon && <span className="page-header__icon" aria-hidden="true"><Icon name={icon} /></span>}
    <div className="page-header__text">
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
    {actions && <div className="page-header__actions action-group">{actions}</div>}
    {art && <div className="page-header__art" aria-hidden="true">{art}</div>}
  </header>;
}
