import { divIcon } from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import type { Hazard } from '../types';

const iconFor = (severity: string) => divIcon({
  className: 'hazard-leaflet-icon',
  html: `<span class="map-pin ${severity}"><span></span></span>`,
  iconSize: [34, 42],
  iconAnchor: [17, 38],
  popupAnchor: [0, -36],
});

export function HazardMap({ hazards, onSelect }: { hazards: Hazard[]; onSelect: (id: string) => void }) {
  return <MapContainer center={[18.5204, 73.8567]} zoom={12} scrollWheelZoom className="leaflet-map">
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    {hazards.map((hazard) => <Marker key={hazard.id} position={[hazard.latitude, hazard.longitude]} icon={iconFor(hazard.severity)}>
      <Popup><div className="map-popup"><span className={`severity-mark ${hazard.severity}`} /><strong>{hazard.hazard_type.replace(/_/g, ' ')}</strong><span>{hazard.status} · {hazard.confirmation_count} reporters</span><button onClick={() => onSelect(hazard.id)}>View record →</button></div></Popup>
    </Marker>)}
  </MapContainer>;
}
