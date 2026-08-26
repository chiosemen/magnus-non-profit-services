import type { ReactNode } from 'react';

/**
 * Minimal inline SVG icon set for the Accord marketing surface.
 * The repo carries no icon library, and the CSP forbids external assets,
 * so icons are stroke paths rendered inline. All are decorative:
 * aria-hidden by default; meaning is always carried by adjacent text.
 */
export type IconName =
  | 'arrow-right'
  | 'alert-triangle'
  | 'alert-circle'
  | 'book-check'
  | 'building'
  | 'calendar-clock'
  | 'check'
  | 'check-circle'
  | 'clipboard-check'
  | 'clock'
  | 'file-search'
  | 'file-text'
  | 'fingerprint'
  | 'folder'
  | 'hand-heart'
  | 'history'
  | 'landmark'
  | 'lock'
  | 'mail'
  | 'menu'
  | 'plus'
  | 'receipt'
  | 'scroll'
  | 'shield-check'
  | 'undo'
  | 'user-check'
  | 'users'
  | 'x';

const PATHS: Record<IconName, ReactNode> = {
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />,
  'alert-triangle': <><path d="M12 3 2.5 20h19z" /><path d="M12 9v5" /><path d="M12 17.5v.5" /></>,
  'alert-circle': <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5" /><path d="M12 16v.5" /></>,
  'book-check': <><path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2 2 2 0 0 0 2 2h13" /><path d="M9 9.5l2 2 4-4" /></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 21v-4h6v4" /><path d="M8 7h.5M12 7h.5M16 7h-.5M8 11h.5M12 11h.5M16 11h-.5" /></>,
  'calendar-clock': <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /><path d="M12 14v3l2 1.5" /></>,
  check: <path d="M4 12l5 5L20 6" />,
  'check-circle': <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" /></>,
  'clipboard-check': <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4a3 3 0 0 1 6 0" /><path d="M9 13l2 2 4-4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  'file-search': <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><circle cx="11" cy="13.5" r="2.5" /><path d="M13 15.5l2 2" /></>,
  'file-text': <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h6" /></>,
  fingerprint: <><path d="M7 19.5c-1.3-2-2-4.3-2-7.5a7 7 0 0 1 14 0c0 1.2-.1 2.4-.3 3.5" /><path d="M12 12a3.5 3.5 0 0 0-3.5 3.6c.1 1.6.5 3 1.2 4.4" /><path d="M12 8.5a3.5 3.5 0 0 1 3.5 3.5c0 2.8-.4 5.2-1.2 7.5" /></>,
  folder: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
  'hand-heart': <><path d="M12 9.2c-1.6-2.6-5.5-1.7-5.5 1 0 2.2 3.2 4.3 5.5 5.8 2.3-1.5 5.5-3.6 5.5-5.8 0-2.7-3.9-3.6-5.5-1z" /><path d="M3 12v8M21 12v8" /></>,
  history: <><path d="M4 12a8 8 0 1 1 2.3 5.7" /><path d="M4 13v-4h4" /><path d="M12 8v4l3 2" /></>,
  landmark: <><path d="M3 9l9-5 9 5" /><path d="M4 9h16v2H4z" /><path d="M6 11v6M10 11v6M14 11v6M18 11v6" /><path d="M3 20h18" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 7l8.5 6 8.5-6" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  plus: <path d="M12 5v14M5 12h14" />,
  receipt: <><path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21z" /><path d="M9 8h6M9 12h6" /></>,
  scroll: <><path d="M7 3h11a2 2 0 0 1 2 2v13a3 3 0 0 1-3 3H7" /><path d="M7 3a2 2 0 0 0-2 2v2h4V5a2 2 0 0 0-2-2z" /><path d="M7 21a2 2 0 0 1-2-2v-2h6v2a2 2 0 0 1-2 2z" /><path d="M11 9h5M11 13h5" /></>,
  'shield-check': <><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-4.5" /></>,
  undo: <><path d="M4 9h10a5 5 0 0 1 0 10H9" /><path d="M8 5L4 9l4 4" /></>,
  'user-check': <><circle cx="9.5" cy="8" r="3.5" /><path d="M3.5 20c1.2-3.2 3.5-4.8 6-4.8s4.8 1.6 6 4.8" /><path d="M15.5 9.5l2 2 4-4" /></>,
  users: <><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19.5c1-2.8 3-4.2 5.5-4.2s4.5 1.4 5.5 4.2" /><circle cx="16.5" cy="9.5" r="2.5" /><path d="M16 15.4c2 .3 3.6 1.6 4.5 4.1" /></>,
  x: <path d="M6 6l12 12M18 6L6 18" />,
};

export function Icon({
  name,
  size = 16,
  label,
}: {
  name: IconName;
  size?: number;
  label?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      {PATHS[name]}
    </svg>
  );
}
