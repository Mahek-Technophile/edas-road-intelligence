const PATHS: Record<string, React.ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1.6" /><rect x="14" y="3" width="7" height="7" rx="1.6" /><rect x="3" y="14" width="7" height="7" rx="1.6" /><rect x="14" y="14" width="7" height="7" rx="1.6" /></>,
  map: <><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" /><circle cx="12" cy="10" r="2.4" /></>,
  steering: <><circle cx="12" cy="12" r="8.4" /><circle cx="12" cy="12" r="2.6" /><path d="M12 3.6v5.8M4.2 16.4l4.9-2.9M19.8 16.4l-4.9-2.9" /></>,
  camera: <><path d="M3 8.6A2.1 2.1 0 0 1 5.1 6.5h2.2l1.2-2h6.8l1.2 2h2.4a2.1 2.1 0 0 1 2.1 2.1v8.3a2.1 2.1 0 0 1-2.1 2.1H5.1A2.1 2.1 0 0 1 3 16.9Z" /><circle cx="12" cy="12.6" r="3.3" /></>,
  network: <><circle cx="12" cy="5" r="2.2" /><circle cx="5" cy="18" r="2.2" /><circle cx="19" cy="18" r="2.2" /><path d="M12 7.2v4.4M10.3 13.2 6.6 16.3M13.7 13.2l3.7 3.1" /></>,
  building: <><path d="M4 21V5.4A1.4 1.4 0 0 1 5.4 4h8.2A1.4 1.4 0 0 1 15 5.4V21" /><path d="M15 9h3.6A1.4 1.4 0 0 1 20 10.4V21M8 8h3M8 12h3M8 16h3M3 21h18" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13M3.6 6h.01M3.6 12h.01M3.6 18h.01" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.36a1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.64 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.64a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.64a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.36 9v.09A1.7 1.7 0 0 0 20.91 10H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" /></>,
  bell: <><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10.3 21a2 2 0 0 0 3.4 0" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></>,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  arrowUpRight: <><path d="M7 17 17 7M8 7h9v9" /></>,
  check: <path d="m5 12.5 4.4 4.4L19 7" />,
  alert: <><path d="M12 3.5 21.2 20H2.8Z" /><path d="M12 9v5M12 17.4h.01" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.4V12l3.2 2" /></>,
  download: <><path d="M12 3v12M7.4 10.6 12 15l4.6-4.4M4 20h16" /></>,
  play: <path d="M8 4.8v14.4L19.4 12Z" />,
  pause: <><path d="M8 5v14M16 5v14" /></>,
  refresh: <><path d="M20 11.4A8 8 0 0 0 5.6 6L3 8.4" /><path d="M4 12.6A8 8 0 0 0 18.4 18l2.6-2.4" /><path d="M3 4v4.4h4.4M21 20v-4.4h-4.4" /></>,
  filter: <><path d="M4 5h16l-6.2 7.3V19l-3.6 1.8v-8.5Z" /></>,
  pin: <><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" /><circle cx="12" cy="10" r="2.2" /></>,
  car: <><path d="m5 16 1.3-4.2A2 2 0 0 1 8.2 10.4h7.6a2 2 0 0 1 1.9 1.4L19 16" /><path d="M3 16h18v3.4h-2.6V18H5.6v1.4H3Z" /><path d="M6.5 13h11" /></>,
  wifi: <><path d="M3.4 8.6a13 13 0 0 1 17.2 0M6.6 12a8.4 8.4 0 0 1 10.8 0M9.7 15.5a4 4 0 0 1 4.6 0" /><path d="M12 19h.01" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  layers: <><path d="m12 3 8.5 4.7L12 12.4 3.5 7.7Z" /><path d="m3.5 12 8.5 4.7 8.5-4.7M3.5 16.3l8.5 4.7 8.5-4.7" /></>,
  target: <><circle cx="12" cy="12" r="8.4" /><circle cx="12" cy="12" r="4.2" /><circle cx="12" cy="12" r=".8" /></>,
  route: <><circle cx="5" cy="19" r="2" /><circle cx="19" cy="5" r="2" /><path d="M7 19h6.2a4 4 0 0 0 0-8H9.4a3.6 3.6 0 0 1 0-7.2" /></>,
  shield: <><path d="M12 3 20 6v6c0 5-3.4 7.8-8 9-4.6-1.2-8-4-8-9V6Z" /><path d="m8.6 12 2.3 2.3 4.6-4.6" /></>,
  sparkles: <><path d="m12 3 1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7Z" /><path d="m18.5 15 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" /></>,
  send: <><path d="m21 3-9.4 18-2.1-7.5L2 11.4Z" /><path d="M21 3 9.5 13.5" /></>,
  cameraOff: <><path d="M3 3l18 18" /><path d="M10.2 5h3.9l1.2 2h2.6a2 2 0 0 1 2.1 2v8.3c0 .5-.2 1-.5 1.4M6.9 6.9 5 6.5a2 2 0 0 0-2 2.1v8.3a2 2 0 0 0 2 2.1h12.1" /></>,
  eye: <><path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
  layers2: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 9h18M9 21V9" /></>,
  pin2: <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v5M12 15.5v5M3.5 12h5M15.5 12h5" /></>,
  playCircle: <><circle cx="12" cy="12" r="8.5" /><path d="m10 8.5 5 3.5-5 3.5Z" /></>,
  flag: <><path d="M5 21V4M5 4h11l-1.6 4L16 12H5" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5.4a3.2 3.2 0 0 1 0 6.2M17.5 14.4A6 6 0 0 1 21 20" /></>,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className = '', strokeWidth = 1.7 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[name]}</svg>;
}

export function BrandMark({ size = 38 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="brand-emblem">
    <rect width="40" height="40" rx="12" fill="#17492f" />
    <path d="M11 27.5c5.5-1 8-4.4 8.4-9.4.2-3.3 2-5.4 5.1-5.7" stroke="#8fe0b0" strokeWidth="2.6" strokeLinecap="round" fill="none" />
    <path d="M23.5 12.4h6.1M22 18.4h6.6M20.4 24.2h5.4" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
    <circle cx="12" cy="27.5" r="2.4" fill="#f5b971" />
  </svg>;
}
