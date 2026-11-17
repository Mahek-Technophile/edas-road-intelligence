import { divIcon } from 'leaflet';
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { useEffect } from 'react';
import { KIND_META, STAGE_META, type Hazard } from '../pilot/types';
import { pct, relativeTime } from '../pilot/format';

const SEVERITY_COLOUR: Record<string, string> = {
  critical: '#c0443a',
  high: '#d97a2b',
  medium: '#3f7ba8',
  low: '#77887c',
};

const TILES = {
  light: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  dark: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
};

function pinIcon(severity: string, selected: boolean) {
  return divIcon({
    className: 'map-pin-holder',
    html: `<span class="map-pin ${severity} ${selected ? 'selected' : ''}"><i></i></span>`,
    iconSize: selected ? [34, 34] : [26, 26],
    iconAnchor: selected ? [17, 17] : [13, 13],
  });
}

function vehicleIcon() {
  return divIcon({
    className: 'map-vehicle-holder',
    html: '<span class="map-vehicle"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 16 1.3-4.2A2 2 0 0 1 8.2 10.4h7.6a2 2 0 0 1 1.9 1.4L19 16"/><path d="M3 16h18v3.4h-2.6V18H5.6v1.4H3Z"/></svg></span>',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function Recenter({ focus }: { focus?: [number, number] }) {
  const map = useMap();
  useEffect(() => { if (focus) map.flyTo(focus, Math.max(map.getZoom(), 13), { duration: 0.8 }); }, [focus, map]);
  return null;
}

export function RoadMap({ hazards, selectedId, onSelect, heat = false, route, vehicle, style = 'light', focus, interactive = true, className = '' }: {
  hazards: Hazard[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  heat?: boolean;
  route?: Array<[number, number]>;
  vehicle?: [number, number] | null;
  style?: 'light' | 'dark';
  focus?: [number, number];
  interactive?: boolean;
  className?: string;
}) {
  return <div className={`road-map ${style} ${className}`}>
    <MapContainer center={[18.5204, 73.8567]} zoom={12} scrollWheelZoom={interactive} dragging={interactive} zoomControl={interactive} className="leaflet-map">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url={TILES[style]} />
      {heat && hazards.map((hazard) => <Circle
        key={`heat-${hazard.id}`}
        center={[hazard.lat, hazard.lng]}
        radius={hazard.severity === 'critical' ? 620 : hazard.severity === 'high' ? 480 : 340}
        pathOptions={{ color: SEVERITY_COLOUR[hazard.severity], fillColor: SEVERITY_COLOUR[hazard.severity], fillOpacity: hazard.severity === 'critical' ? 0.28 : 0.18, weight: 0, interactive: false }}
      />)}
      {route && <Polyline positions={route} pathOptions={{ color: '#2c6c4f', weight: 5, opacity: 0.75, dashArray: '1 9', lineCap: 'round' }} />}
      {hazards.map((hazard) => <Marker
        key={hazard.id}
        position={[hazard.lat, hazard.lng]}
        icon={pinIcon(hazard.severity, selectedId === hazard.id)}
        eventHandlers={{ click: () => onSelect?.(hazard.id) }}
      >
        <Popup>
          <div className="map-popup">
            <span className={`popup-severity ${hazard.severity}`}>{hazard.severity} severity</span>
            <strong>{KIND_META[hazard.kind].label}</strong>
            <p>{hazard.landmark} · {hazard.road}</p>
            <div className="popup-grid">
              <span><b>{pct(hazard.confidence)}</b> confidence</span>
              <span><b>{hazard.reports}</b> reporters</span>
            </div>
            <div className="popup-status"><span className={`status-dot ${STAGE_META[hazard.stage].tone}`} />{STAGE_META[hazard.stage].label} · {relativeTime(hazard.lastSeen)}</div>
            {onSelect && <button className="popup-link" onClick={() => onSelect(hazard.id)}>Open hazard record →</button>}
          </div>
        </Popup>
      </Marker>)}
      {vehicle && <Marker position={vehicle} icon={vehicleIcon()} zIndexOffset={500} />}
      <Recenter focus={focus} />
    </MapContainer>
  </div>;
}
