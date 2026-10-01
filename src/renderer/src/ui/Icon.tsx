// Tenon Modern's icon set: stroke icons on a 24px grid, 1.8px round stroke, currentColor.
// Paths copied from the design system's compiled bundle (project/components/bundle.js), so the
// glyphs match exactly. Icon.names / iconNames lists every name for the design system's own preview grid.
import type { ReactNode } from "react";

const dots = (points: [number, number][]) => points.map(([cx, cy]) => <circle key={`${cx},${cy}`} cx={cx} cy={cy} r="1" fill="currentColor" />);

const icons = {
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  branch: <><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="8" r="2" /><path d="M6 7v10M18 10c0 5-8 3-12 7" /></>,
  share: <><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 13v6h14v-6" /></>,
  download: <><path d="M12 4v11M7 10l5 5 5-5" /><path d="M5 20h14" /></>,
  play: <path d="M7 5l12 7-12 7z" fill="currentColor" stroke="none" />,
  pause: <path d="M8 5v14M16 5v14" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  check: <path d="M5 12l5 5 9-10" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  clip: <path d="M20 11l-8 8a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8" />,
  send: <path d="M5 12h14M13 6l6 6-6 6" />,
  bot: <><rect x="4" y="7" width="16" height="12" rx="3" /><path d="M12 3v4M9 13h.01M15 13h.01" /></>,
  terminal: <path d="M4 6l6 6-6 6M12 18h8" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 20c1.5-4 5-5 8-5s6.5 1 8 5" /></>,
  split: <path d="M12 3v6M12 9l-6 6v6M12 9l6 6v6" />,
  condition: <path d="M12 3l9 9-9 9-9-9z" />,
  loop: <path d="M4 12a8 8 0 0 1 14-5l2 2M20 4v5h-5M20 12a8 8 0 0 1-14 5l-2-2M4 20v-5h5" />,
  canvas: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9h18M8 20V9" /></>,
  phone: <><rect x="7" y="2" width="10" height="20" rx="2.5" /><path d="M11 18h2" /></>,
  flow: <><circle cx="5" cy="6" r="2" /><circle cx="19" cy="18" r="2" /><path d="M7 6h6a4 4 0 0 1 4 4v6" /></>,
  file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></>,
  bolt: <path d="M13 3L5 14h6l-1 7 8-11h-6z" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  dots: <>{dots([[5, 12], [12, 12], [19, 12]])}</>,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  pencil: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13 7l4 4" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3" /></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11" />{dots([[4.5, 6], [4.5, 12], [4.5, 18]])}</>,
  tag: <><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.3" fill="currentColor" /></>,
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  box: <><path d="M3 7l9-4 9 4v10l-9 4-9-4z" /><path d="M3 7l9 4 9-4M12 11v10" /></>,
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>,
  server: <><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  alert: <><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17h.01" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></>,
  grip: <>{dots([[9, 6], [15, 6], [9, 12], [15, 12], [9, 18], [15, 18]])}</>,
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  import: <><path d="M12 3v12M7 10l5 5 5-5" /><rect x="3" y="17" width="18" height="4" rx="1.5" /></>,
  cpu: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" />{dots([[7.5, 11], [10, 7], [15, 7.5]])}</>,
  keyboard: <><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></>,
  wrench: <><path d="M14.5 5.5a4 4 0 0 0 5 5L12 18a2.1 2.1 0 0 1-3-3z" /><path d="M14.5 5.5L17 3l4 4-2.5 2.5" /></>,
  doc: <><path d="M6 3h8l4 4v14H6z" /><path d="M9 12h6M9 16h6" /></>,
  at: <><circle cx="12" cy="12" r="4" /><path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1" /></>,
  zoomIn: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5M11 8v6M8 11h6" /></>,
  zoomOut: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5M8 11h6" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof icons;
export const iconNames = Object.keys(icons) as IconName[];

export function Icon({ name, size = 15, color = "currentColor" }: { name: IconName; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[name]}
    </svg>
  );
}

/**
 * The Tenon mark, "Orbit": an open accent ring with an orange dot at its end (the ring is the spinner
 * shape — pi at work), and a τ in orange inside. Exact paths from the Logos asset (tenon-mark.svg).
 */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Tenon">
      <path d="M10.61 2.1A10 10 0 1 0 19.66 5.57" fill="none" stroke="var(--color-accent)" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="19.66" cy="5.57" r="1.9" fill="var(--color-orange)" />
      <path d="M6.96 8.4H17.04M12 8.4v8.06c0 1.46.78 2.02 2.02 2.02" fill="none" stroke="var(--color-orange)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
