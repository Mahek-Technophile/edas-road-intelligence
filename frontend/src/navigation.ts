import type { IconName } from './components/Icon';

export type PageId = 'overview' | 'map' | 'driver' | 'vision' | 'crowd' | 'civic' | 'reports' | 'report' | 'settings';

export interface NavItem { id: PageId; label: string; icon: IconName; hint?: string }

export const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  { label: 'Operations', items: [
    { id: 'overview', label: 'Command centre', icon: 'overview' },
    { id: 'map', label: 'Live hazard map', icon: 'map' },
    { id: 'driver', label: 'Driver assistance', icon: 'steering' },
  ] },
  { label: 'Road intelligence', items: [
    { id: 'vision', label: 'Vision Lab', icon: 'camera' },
    { id: 'crowd', label: 'Crowdsourced', icon: 'network' },
  ] },
  { label: 'Civic operations', items: [
    { id: 'civic', label: 'Civic intelligence', icon: 'building' },
    { id: 'reports', label: 'Hazard register', icon: 'list' },
  ] },
];

export const PAGE_TITLES: Record<PageId, { title: string; crumb: string }> = {
  overview: { title: 'Command centre', crumb: 'Overview' },
  map: { title: 'Live hazard map', crumb: 'Map' },
  driver: { title: 'Driver assistance', crumb: 'Drive' },
  vision: { title: 'Vision Lab', crumb: 'Vision' },
  crowd: { title: 'Crowdsourced intelligence', crumb: 'Consensus' },
  civic: { title: 'Civic intelligence', crumb: 'Civic' },
  reports: { title: 'Hazard register', crumb: 'Register' },
  report: { title: 'Report a hazard', crumb: 'New report' },
  settings: { title: 'Workspace settings', crumb: 'Settings' },
};

export const PAGES: PageId[] = ['overview', 'map', 'driver', 'vision', 'crowd', 'civic', 'reports', 'report', 'settings'];
