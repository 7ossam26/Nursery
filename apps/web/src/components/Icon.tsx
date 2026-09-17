import type { SVGProps } from 'react';

export type IconName =
  | 'home' | 'children' | 'wallet' | 'bell' | 'more' | 'calendar' | 'classroom' | 'learning'
  | 'overview' | 'finance' | 'staff' | 'support' | 'settings' | 'check' | 'warning' | 'close' | 'arrow' | 'star'
  | 'sun' | 'moon' | 'display' | 'search' | 'chevron' | 'panel' | 'user' | 'logout' | 'sparkle'
  | 'plus' | 'edit' | 'trash' | 'download' | 'upload' | 'refresh' | 'filter' | 'back' | 'print';

const paths: Record<IconName, string> = {
  plus: 'M12 5v14M5 12h14',
  edit: 'm16 3 5 5-12 12-6 1 1-6ZM14 5l5 5',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  upload: 'M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5',
  refresh: 'M20 7v5h-5M4 17v-5h5M6.5 5.5A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.5 6.5',
  filter: 'M3 4h18l-7 8v7l-4 2v-9Z',
  back: 'M19 12H5m6-6-6 6 6 6',
  print: 'M6 8V3h12v5M6 17H3V9h18v8h-3M6 14h12v7H6zM17 11h1',
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
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-15v2m0 20v-2m10-10h-2M4 12H2m15.07-7.07-1.41 1.41M6.34 17.66l-1.41 1.41m12.73 0-1.41-1.41M6.34 6.34 4.93 4.93',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  display: 'M3 5h18v11H3zM8 21h8m-4-5v5',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
  chevron: 'm9 5 7 7-7 7',
  panel: 'M3 4h18v16H3zM9 4v16',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1',
  logout: 'M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5M9 16l-4-4 4-4m-4 4h11',
  sparkle: 'M12 3v6m0 6v6m-9-9h6m6 0h6M7.5 7.5l2 2m5 5 2 2m0-9-2 2m-5 5-2 2'
};

export function Icon({ name, className = '', ...props }: Readonly<{ name: IconName }> & SVGProps<SVGSVGElement>) {
  // className is merged rather than spread last, so a caller's modifier never drops the `.icon` sizing.
  return (
    <svg className={`icon icon--${name} ${className}`.trim()} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path d={paths[name]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
