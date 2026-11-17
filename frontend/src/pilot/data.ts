import type { DriverAlert, Hazard, HazardEvent, HazardKind, Severity, Stage, Vehicle, VerificationStep } from './types';

const NOW = Date.now();
export const nowIso = () => new Date().toISOString();
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();
const minsAgo = (mins: number) => new Date(NOW - mins * 60_000).toISOString();

function eventsFor(hoursOld: number, source: Hazard['source'], reports: number, confidence: number): HazardEvent[] {
  const events: HazardEvent[] = [
    { at: ago(hoursOld), source, label: 'First observation', confidence: Math.max(0.55, confidence - 0.18), detail: 'Hazard candidate associated with the corridor GPS trace.' },
    { at: ago(Math.max(0.1, hoursOld - 0.4)), source: 'EDAS road intelligence', label: 'Spatial match confirmed', detail: 'Candidate grouped with nearby observations inside the 35 m match radius.' },
  ];
  if (reports > 1) {
    events.push({ at: ago(Math.max(0.05, hoursOld - 1.1)), source: 'Independent vehicle', label: 'Independent observation added', confidence: Math.min(0.99, confidence - 0.05), detail: `${reports} independent reporters now agree on this location.` });
  }
  if (confidence > 0.85) {
    events.push({ at: ago(Math.max(0.02, hoursOld - 1.8)), source: 'Consensus engine', label: 'Consensus threshold reached', confidence, detail: 'Hazard promoted to verified for the municipal queue.' });
  }
  return events;
}

type Seed = [string, HazardKind, Severity, string, string, string, number, number, Stage, number, number, number, Hazard['source'], string, string, number, number?];

const SEEDS: Seed[] = [
  ['EDAS-1042', 'pothole', 'critical', 'Sinhagad Road', 'Sinhagad Road', 'Nanded City gate', 18.4640, 73.8310, 'independently_verified', 7, 0.96, 2, 'Vision Lab', 'Deep pothole across the left wheel path, roughly 1.2 m wide. Water ingress visible after rain.', 'Zone 4 · Warje', 24, 19],
  ['EDAS-1043', 'open_manhole', 'critical', 'Sinhagad Road', 'Sinhagad Road', 'Anandnagar bridge', 18.4745, 73.8292, 'in_progress', 5, 0.93, 5, 'Driver app', 'Cover missing on the left shoulder; barricade requested from the ward office.', 'Zone 4 · Warje', 8],
  ['EDAS-1044', 'road_crack', 'high', 'Katraj–Kondhwa Road', 'Katraj–Kondhwa', 'Bharati Vidyapeeth gate', 18.4585, 73.8648, 'verified', 4, 0.88, 7, 'Vision Lab', 'Longitudinal cracking along the bus lane, 6 m long with edge disintegration.', 'Zone 3 · Kondhwa', 48],
  ['EDAS-1045', 'waterlogging', 'high', 'Sinhagad Road', 'Sinhagad Road', 'Vitthalwadi', 18.4812, 73.8275, 'assigned', 3, 0.85, 9, 'Driver app', 'Standing water 40 mm deep across the left lane after evening rain.', 'Zone 4 · Warje', 12],
  ['EDAS-1046', 'obstruction', 'medium', 'Karve Road', 'Karve Road', 'Nal Stop', 18.5034, 73.8135, 'reported', 2, 0.74, 1.5, 'Driver app', 'Construction material stacked into the service lane, narrowing the approach.', 'Zone 2 · Kothrud', 24],
  ['EDAS-1047', 'pothole', 'high', 'Pune–Satara Road', 'Pune–Satara Road', 'Swargate bus stand', 18.5015, 73.8447, 'in_progress', 6, 0.91, 12, 'Vision Lab', 'Cluster of three potholes near the bus bay; temporary filling has worn through.', 'Zone 1 · Central', 18],
  ['EDAS-1048', 'pothole', 'medium', 'FC Road', 'FC Road', 'Fergusson College gate', 18.5236, 73.8407, 'repaired', 4, 0.89, 30, 'Driver app', 'Shallow pothole on the northbound lane, patched by the ward crew.', 'Zone 2 · Kothrud', 24, 22],
  ['EDAS-1049', 'open_manhole', 'critical', 'JM Road', 'JM Road', 'Balgandharva Chowk', 18.5195, 73.8477, 'assigned', 8, 0.97, 4, 'Field survey', 'Manhole cover displaced into the carriageway. High pedestrian footfall nearby.', 'Zone 1 · Central', 6],
  ['EDAS-1050', 'road_crack', 'high', 'Baner Road', 'Baner–Aundh', 'Baner gaon', 18.5595, 73.7874, 'verified', 3, 0.82, 15, 'Vision Lab', 'Transverse cracking across two lanes near the junction stop line.', 'Zone 5 · Aundh', 72],
  ['EDAS-1051', 'pothole', 'high', 'Aundh Road', 'Baner–Aundh', 'Bremen Chowk', 18.5599, 73.8074, 'independently_verified', 5, 0.94, 40, 'Vision Lab', 'Repair completed and re-observed clean by three vehicles over two passes.', 'Zone 5 · Aundh', 48, 26],
  ['EDAS-1052', 'waterlogging', 'critical', 'Nagar Road', 'Nagar Road', 'Yerawada bridge', 18.5538, 73.8803, 'in_progress', 9, 0.95, 3, 'Driver app', 'Knee-deep water under the flyover; one lane impassable for two-wheelers.', 'Zone 6 · Yerawada', 8],
  ['EDAS-1053', 'pothole', 'medium', 'Kharadi bypass', 'Nagar Road', 'EON IT Park gate', 18.5515, 73.9455, 'verified', 3, 0.83, 20, 'Driver app', 'Edge-of-lane pothole on the IT park approach, active during shift changes.', 'Zone 6 · Yerawada', 48],
  ['EDAS-1054', 'obstruction', 'high', 'Airport Road', 'Airport Road', 'Symbiosis campus', 18.5797, 73.9082, 'reported', 2, 0.76, 2, 'Driver app', 'Broken-down goods vehicle partially blocking the left lane.', 'Zone 6 · Yerawada', 6],
  ['EDAS-1055', 'pothole', 'critical', 'Hinjawadi–Wakad Road', 'Hinjawadi', 'Phase 1 main gate', 18.5916, 73.7384, 'in_progress', 11, 0.96, 8, 'Vision Lab', 'Severe pothole at the Phase 1 entry, repeatedly reported by the IT commute fleet.', 'Zone 7 · Pimpri', 12],
  ['EDAS-1056', 'road_crack', 'medium', 'Wakad Road', 'Hinjawadi', 'Bhujbal Chowk', 18.5991, 73.7626, 'verified', 2, 0.79, 18, 'Vision Lab', 'Alligator cracking around a utility trench reinstatement.', 'Zone 7 · Pimpri', 72],
  ['EDAS-1057', 'waterlogging', 'high', 'Mumbai–Bangalore Bypass', 'Mumbai–Bangalore Bypass', 'Warje flyover', 18.4837, 73.7986, 'assigned', 4, 0.87, 6, 'Driver app', 'Drainage choke causing water to sheet across the left lane.', 'Zone 4 · Warje', 12],
  ['EDAS-1058', 'pothole', 'high', 'Solapur Road', 'Solapur Road', 'Hadapsar station', 18.5083, 73.9264, 'repaired', 6, 0.90, 55, 'Vision Lab', 'Two potholes merged into a long depression; full-width patch completed.', 'Zone 3 · Kondhwa', 48, 31],
  ['EDAS-1059', 'open_manhole', 'high', 'Magarpatta inner road', 'Solapur Road', 'Magarpatta city gate', 18.5152, 73.9282, 'verified', 3, 0.88, 10, 'Field survey', 'Raised manhole frame creating a two-wheeler hazard at night.', 'Zone 3 · Kondhwa', 24],
  ['EDAS-1060', 'obstruction', 'low', 'Pashan–Sus Road', 'Baner–Aundh', 'Pashan lake', 18.5382, 73.7895, 'reported', 1, 0.68, 0.8, 'Driver app', 'Fallen tree branch on the lake-side shoulder.', 'Zone 5 · Aundh', 24],
  ['EDAS-1061', 'pothole', 'medium', 'Kothrud Road', 'Karve Road', 'Gandhi Bhavan', 18.5074, 73.8075, 'assigned', 5, 0.84, 14, 'Driver app', 'Moderate pothole near the bus stop; buses are swerving to avoid it.', 'Zone 2 · Kothrud', 48],
  ['EDAS-1062', 'accident', 'critical', 'Solapur Road', 'Solapur Road', 'Ramwadi junction', 18.5455, 73.9155, 'independently_verified', 7, 0.92, 60, 'Driver app', 'Collision debris cleared; site re-observed clean by the evening fleet.', 'Zone 6 · Yerawada', 8, 34],
  ['EDAS-1063', 'pothole', 'low', 'NIBM Road', 'Katraj–Kondhwa', 'Cloud 9 housing', 18.4634, 73.8991, 'detected', 1, 0.66, 0.3, 'Vision Lab', 'New candidate from the morning survey run; awaiting a second observation.', 'Zone 3 · Kondhwa', 48],
  ['EDAS-1064', 'road_crack', 'high', 'Koregaon Park lane 7', 'Airport Road', 'Koregaon Park', 18.5361, 73.8943, 'verified', 4, 0.86, 16, 'Vision Lab', 'Cracked asphalt around a storm drain, widening after heavy traffic.', 'Zone 6 · Yerawada', 72],
  ['EDAS-1065', 'waterlogging', 'medium', 'MG Road', 'JM Road', 'Camp', 18.5148, 73.8792, 'repaired', 4, 0.83, 48, 'Driver app', 'Drain cleared and carriageway dried; monitoring through the monsoon.', 'Zone 1 · Central', 24, 27],
  ['EDAS-1066', 'pothole', 'high', 'Deccan Gymkhana', 'Karve Road', 'Good Luck Chowk', 18.5141, 73.8415, 'repaired', 5, 0.90, 36, 'Vision Lab', 'Patch completed across the junction approach; lane markings restored.', 'Zone 2 · Kothrud', 48, 24],
  ['EDAS-1067', 'open_manhole', 'critical', 'Pimpri link road', 'Hinjawadi', 'Bhosari link', 18.6295, 73.7995, 'in_progress', 6, 0.94, 11, 'Field survey', 'Cover replacement scheduled with the drainage contractor.', 'Zone 7 · Pimpri', 8],
  ['EDAS-1068', 'pothole', 'medium', 'Balewadi High Street', 'Baner–Aundh', 'Balewadi stadium', 18.5746, 73.7689, 'independently_verified', 4, 0.89, 44, 'Vision Lab', 'Repair re-verified after the weekend; no surface defect detected.', 'Zone 5 · Aundh', 48, 18],
  ['EDAS-1069', 'obstruction', 'medium', 'Wagholi–Nagar Road', 'Nagar Road', 'Wagholi square', 18.5803, 73.9806, 'detected', 1, 0.71, 0.6, 'Driver app', 'Overloaded two-wheeler parked in the live lane; candidate only.', 'Zone 6 · Yerawada', 24],
  ['EDAS-1070', 'road_crack', 'low', 'Ravet bypass', 'Hinjawadi', 'Ravet bridge', 18.6492, 73.7441, 'reported', 2, 0.73, 3, 'Vision Lab', 'Hairline cracking on the bridge expansion joint approach.', 'Zone 7 · Pimpri', 72],
  ['EDAS-1071', 'pothole', 'high', 'Saswad Road', 'Solapur Road', 'Undri junction', 18.4620, 73.9010, 'assigned', 3, 0.81, 13, 'Driver app', 'Deep edge pothole on the two-wheeler path near the junction.', 'Zone 3 · Kondhwa', 48],
];

export const SEED_HAZARDS: Hazard[] = SEEDS.map(([id, kind, severity, road, corridor, landmark, lat, lng, stage, reports, confidence, hours, source, description, team, slaHours, resolvedHours]) => ({
  id,
  kind,
  severity,
  confidence,
  reports,
  observations: reports + (id.charCodeAt(9) % 4),
  stage,
  lat,
  lng,
  road,
  corridor,
  landmark,
  firstSeen: ago(hours),
  lastSeen: ago(Math.max(0.05, hours - 0.3)),
  description,
  source,
  team,
  slaHours,
  resolvedHours,
  events: eventsFor(hours, source, reports, confidence),
}));

export const SEED_VEHICLES: Vehicle[] = [
  { id: 'VH-01', plate: 'MH12 ED 4821', model: 'Maruti Dzire', role: 'Ride-share', corridor: 'Sinhagad Road', status: 'streaming', detections: 34, km: 86.4, lastSync: minsAgo(0.2), battery: 74, network: '5G' },
  { id: 'VH-02', plate: 'MH12 ED 1934', model: 'Hyundai i20', role: 'Commuter', corridor: 'Sinhagad Road', status: 'streaming', detections: 21, km: 42.8, lastSync: minsAgo(0.4), battery: 61, network: '4G' },
  { id: 'VH-03', plate: 'MH14 KL 7720', model: 'Tata Ace', role: 'Last-mile fleet', corridor: 'Katraj–Kondhwa', status: 'streaming', detections: 47, km: 118.2, lastSync: minsAgo(0.1), battery: 88, network: '5G' },
  { id: 'VH-04', plate: 'MH12 AB 9082', model: 'Honda City', role: 'Commuter', corridor: 'Karve Road', status: 'syncing', detections: 16, km: 33.1, lastSync: minsAgo(3.4), battery: 42, network: '4G' },
  { id: 'VH-05', plate: 'MH12 ED 6612', model: 'Maruti Ertiga', role: 'Cab fleet', corridor: 'Pune–Satara Road', status: 'streaming', detections: 29, km: 97.6, lastSync: minsAgo(0.6), battery: 66, network: '4G' },
  { id: 'VH-06', plate: 'MH14 GH 3374', model: 'Mahindra XUV', role: 'Fleet supervisor', corridor: 'Nagar Road', status: 'streaming', detections: 38, km: 104.9, lastSync: minsAgo(0.3), battery: 79, network: '5G' },
  { id: 'VH-07', plate: 'MH12 JK 5188', model: 'Tata Nexon', role: 'Commuter', corridor: 'Baner–Aundh', status: 'idle', detections: 9, km: 18.3, lastSync: minsAgo(22), battery: 35, network: 'Wi-Fi' },
  { id: 'VH-08', plate: 'MH12 ED 7741', model: 'Toyota Innova', role: 'Airport transfers', corridor: 'Airport Road', status: 'streaming', detections: 25, km: 73.5, lastSync: minsAgo(0.8), battery: 57, network: '4G' },
  { id: 'VH-09', plate: 'MH14 BN 2206', model: 'Bajaj RE', role: 'Last-mile fleet', corridor: 'Hinjawadi', status: 'syncing', detections: 12, km: 51.0, lastSync: minsAgo(5.1), battery: 48, network: '4G' },
  { id: 'VH-10', plate: 'MH12 CD 3409', model: 'Skoda Slavia', role: 'Commuter', corridor: 'Solapur Road', status: 'streaming', detections: 18, km: 61.7, lastSync: minsAgo(0.5), battery: 81, network: '5G' },
  { id: 'VH-11', plate: 'MH12 EF 8820', model: 'Mahindra Bolero', role: 'Municipal survey', corridor: 'Mumbai–Bangalore Bypass', status: 'streaming', detections: 41, km: 132.4, lastSync: minsAgo(0.2), battery: 92, network: '5G' },
  { id: 'VH-12', plate: 'MH12 QR 1190', model: 'Maruti Baleno', role: 'Commuter', corridor: 'Koregaon Park', status: 'idle', detections: 7, km: 12.8, lastSync: minsAgo(37), battery: 29, network: 'Wi-Fi' },
];

export const ROUTE: Array<[number, number]> = [
  [18.4640, 73.8310],
  [18.4684, 73.8304],
  [18.4745, 73.8292],
  [18.4812, 73.8275],
  [18.4892, 73.8288],
  [18.4948, 73.8341],
  [18.4979, 73.8401],
  [18.5015, 73.8447],
];

export const ROUTE_ALERTS: DriverAlert[] = [
  { id: 'ALT-01', hazardId: 'EDAS-1042', title: 'Large pothole ahead', severity: 'high', distance: 120, confidence: 0.96, action: 'Reduce to 30 km/h and hold the centre lane.', note: 'Confirmed by 7 vehicles on this corridor. Left wheel path affected.', triggerAt: 0.2 },
  { id: 'ALT-02', hazardId: 'EDAS-1043', title: 'Open manhole on route', severity: 'critical', distance: 380, confidence: 0.93, action: 'Move right. Do not overtake near the bridge.', note: 'Ward barricade requested; approach with caution.', triggerAt: 0.44 },
  { id: 'ALT-03', hazardId: 'EDAS-1047', title: 'Multiple vehicles confirmed road damage', severity: 'high', distance: 640, confidence: 0.91, action: 'Reduce speed and increase following distance.', note: 'Three linked potholes near the Swargate bus bay.', triggerAt: 0.68 },
  { id: 'ALT-04', hazardId: 'EDAS-1045', title: 'Waterlogging reported ahead', severity: 'medium', distance: 900, confidence: 0.85, action: 'Keep left and avoid sudden braking.', note: 'Standing water across the left lane after rain.', triggerAt: 0.86 },
];

export const VERIFICATION: VerificationStep[] = [
  { at: '08:42:16', vehicle: 'Vehicle A · MH12 ED 4821', plate: 'MH12 ED 4821', confidence: 0.72, note: 'Vision Lab candidate: pothole, 1.2 m width, 38 m ahead.' },
  { at: '08:42:16', vehicle: 'Vision Lab', plate: 'vision', confidence: 0.72, note: 'Bounding box captured, GPS projected onto Sinhagad Road centreline.' },
  { at: '08:43:02', vehicle: 'Vehicle B · MH12 ED 1934', plate: 'MH12 ED 1934', confidence: 0.88, note: 'Independent approach confirms road-surface depression in the same 35 m cell.' },
  { at: '08:43:05', vehicle: 'Consensus engine', plate: 'engine', confidence: 0.88, note: 'Duplicate frame from Vehicle A removed before scoring. 2 independent observers.' },
  { at: '08:43:40', vehicle: 'Vehicle C · MH14 KL 7720', plate: 'MH14 KL 7720', confidence: 0.94, note: 'Third independent observation crosses the verified threshold.' },
  { at: '08:44:12', vehicle: 'EDAS alert service', plate: 'service', confidence: 0.94, note: 'Alert pushed to 14 vehicles within 1.2 km; civic case queued for Zone 4.' },
];

export const OBSERVATION_LEDGER = [
  { at: '08:43:02', source: 'Vehicle B', detail: 'Vision match · 0.86 confidence', status: 'accepted' },
  { at: '08:43:05', source: 'Vehicle A', detail: 'Duplicate frame · 8 m from candidate', status: 'deduplicated' },
  { at: '08:43:40', source: 'Vehicle C', detail: 'Vision match · 0.91 confidence', status: 'accepted' },
  { at: '08:43:41', source: 'Vehicle D', detail: 'Ride-quality spike · 1.9 g vertical', status: 'sensor evidence' },
  { at: '08:44:12', source: 'EDAS alert service', detail: 'Verified alert · 1.2 km radius', status: 'published' },
];

export const WEEKLY_OBSERVATIONS = [
  { day: 'Mon', count: 42, confirmed: 31 },
  { day: 'Tue', count: 51, confirmed: 39 },
  { day: 'Wed', count: 47, confirmed: 35 },
  { day: 'Thu', count: 63, confirmed: 52 },
  { day: 'Fri', count: 58, confirmed: 46 },
  { day: 'Sat', count: 72, confirmed: 61 },
  { day: 'Sun', count: 79, confirmed: 67 },
];

export const CORRIDOR_PERFORMANCE = [
  { corridor: 'Sinhagad Road', hazards: 7, resolution: 71 },
  { corridor: 'Solapur Road', hazards: 5, resolution: 64 },
  { corridor: 'Hinjawadi', hazards: 5, resolution: 58 },
  { corridor: 'Nagar Road', hazards: 4, resolution: 52 },
  { corridor: 'Karve Road', hazards: 4, resolution: 61 },
  { corridor: 'Baner–Aundh', hazards: 5, resolution: 66 },
];

export const SAFETY_NOTES = [
  { key: 'road', title: 'Road context first', body: 'Every detection is linked to a corridor, a GPS trace and a direction of travel before it becomes an alert.' },
  { key: 'review', title: 'Human review gate', body: 'Vision events enter the civic queue only after an operator confirms the hazard and its location.' },
  { key: 'privacy', title: 'Privacy by design', body: 'Clips are processed for hazards, not faces or plates. Only hazard frames and metadata are retained.' },
];
