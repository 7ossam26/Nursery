import type { SVGProps } from 'react';

export type IconName =
  | 'home' | 'children' | 'wallet' | 'bell' | 'more' | 'calendar' | 'classroom' | 'learning'
  | 'overview' | 'finance' | 'staff' | 'support' | 'settings' | 'check' | 'warning' | 'close' | 'arrow' | 'star';

const paths: Record<IconName, string> = {
  home: 'M3 11.5 12 4l9 7.5V21h-6v-6H9v6H3z',
  children: 'M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-1a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 21v-2a6 6 0 0 1 12 0v2Zm12.5 0v-2a8 8 0 0 0-1.2-4.2A5 5 0 0 1 22 18v3Z',
  wallet: 'M3 6h16a2 2 0 0 1 2 2v11H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h15v3Zm13 5v4h5v-4Z',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 12h4',
  more: 'M5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
  calendar: 'M4 5h16v16H4zM8 2v6m8-6v6M4 10h16',
  classroom: 'M3 4h18v13H3zM8 21h8m-4-4v4M7 10h4m-4 3h8',
  learning: 'm2 8 10-5 10 5-10 5Zm4 3v5c3 3 9 3 12 0v-5',
  overview: 'M3 3h8v8H3zm10 0h8v5h-8zm0 7h8v11h-8zM3 13h8v8H3z',
  finance: 'M12 2v20m5-16H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  staff: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-1 2 2 4-5',
  support: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-6v.01M9.1 9a3 3 0 1 1 4.2 2.75c-.8.45-1.3 1-1.3 2.25',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0-13v3m0 13v3m9.5-9.5h-3m-13 0h-3m16.2-6.2-2.1 2.1m-9.2 9.2-2.1 2.1m13.4 0-2.1-2.1M7.4 7.9 5.3 5.8',
  check: 'm4 12 5 5L20 6',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z',
  warning: 'M12 3 2 21h20Zm0 6v5m0 3v.01',
  close: 'M5 5l14 14M19 5 5 19',
  arrow: 'M5 12h14m-6-6 6 6-6 6'
};

export function Icon({ name, ...props }: Readonly<{ name: IconName }> & SVGProps<SVGSVGElement>) {
  return (
    <svg className={`icon ${props.className ?? ''}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path d={paths[name]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
