import { useId, type ReactNode } from 'react';
import { Button } from './controls.js';
import { Icon, type IconName } from './Icon.js';

/** Stays a <section>: several end-to-end scripts reach a card through `heading.closest('section')`. */
export function Card({ children, className = '', title, variant, interactive = false }: Readonly<{
  children: ReactNode;
  className?: string;
  title?: string;
  variant?: 'accent' | 'warning' | 'danger' | 'finance' | 'glass';
  interactive?: boolean;
}>) {
  const modifiers = `${variant ? `card--${variant}` : ''} ${interactive ? 'card--interactive' : ''}`.trim();
  return <section className={`card ${modifiers} ${className}`.replace(/\s+/g, ' ').trim()}>{title && <h2 className="card__title">{title}</h2>}{children}</section>;
}

export function Skeleton({ label, lines = 3 }: Readonly<{ label: string; lines?: number }>) {
  return <div className="skeleton" role="status"><span className="visually-hidden">{label}</span>{Array.from({ length: lines }, (_, index) => <span className="skeleton__line" key={index} />)}</div>;
}

export function StatePanel({ tone, title, body, actionLabel, onAction }: Readonly<{
  tone: 'empty' | 'error' | 'no-permission' | 'success';
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}>) {
  const titleId = useId();
  const icon: IconName = tone === 'error' || tone === 'no-permission' ? 'warning' : 'check';
  return <section className={`state-panel state-panel--${tone}`} aria-labelledby={titleId}><Icon name={icon} className="state-panel__icon" /><div><h3 id={titleId}>{title}</h3><p>{body}</p>{actionLabel && <Button variant="secondary" onClick={onAction}>{actionLabel}</Button>}</div></section>;
}

export type TableColumn<Row> = Readonly<{ key: string; heading: string; cell: (row: Row) => ReactNode; numeric?: boolean }>;

export function ResponsiveTable<Row>({ caption, columns, rows, rowKey, empty }: Readonly<{
  caption: string;
  columns: ReadonlyArray<TableColumn<Row>>;
  rows: ReadonlyArray<Row>;
  rowKey: (row: Row) => string;
  /** Opt-in replacement for an empty result. Omitting it keeps the previous behaviour of rendering
   *  the headed table with no body rows, which several callers already pair with their own message. */
  empty?: ReactNode;
}>) {
  if (empty !== undefined && rows.length === 0) return <div className="responsive-table">{empty}</div>;
  return <div className="responsive-table">
    <div className="responsive-table__scroll" tabIndex={0} aria-label={caption}>
      <table><caption>{caption}</caption><thead><tr>{columns.map((column) => <th scope="col" key={column.key} className={column.numeric ? 'numeric' : undefined}>{column.heading}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={rowKey(row)}>{columns.map((column) => <td key={column.key} className={column.numeric ? 'numeric' : undefined}>{column.cell(row)}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <ul className="responsive-table__cards" aria-label={caption}>{rows.map((row) => <li key={rowKey(row)}><dl>{columns.map((column) => <div key={column.key}><dt>{column.heading}</dt><dd className={column.numeric ? 'numeric' : undefined}>{column.cell(row)}</dd></div>)}</dl></li>)}</ul>
  </div>;
}
