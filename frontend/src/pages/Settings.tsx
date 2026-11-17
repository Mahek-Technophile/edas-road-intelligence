import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Badge, PageHeader, Panel } from '../components/ui';
import { downloadCsv } from '../pilot/format';
import { usePilot } from '../pilot/store';
import { SEVERITIES, SEVERITY_META, type Severity } from '../pilot/types';

export default function Settings() {
  const { hazards, vehicles, settings, updateSettings, connectApi, disconnectApi, resetPilot, apiState, apiMessage, notify } = usePilot();
  const [apiToken, setApiToken] = useState('');

  return <>
    <PageHeader
      eyebrow="WORKSPACE · PUNE OPERATIONS"
      title="Settings"
      copy="Tune driver alerts, display preferences and the data connection for this pilot workspace."
      actions={<button className="btn btn-outline" onClick={() => {
        downloadCsv('edas-pilot-export.csv', hazards.map((hazard) => ({
          id: hazard.id, category: hazard.kind, severity: hazard.severity, road: hazard.road, landmark: hazard.landmark,
          latitude: hazard.lat, longitude: hazard.lng, stage: hazard.stage, confidence: hazard.confidence,
          reports: hazard.reports, source: hazard.source, team: hazard.team, first_seen: hazard.firstSeen, last_seen: hazard.lastSeen,
        })));
        notify('Pilot register exported.');
      }}><Icon name="download" size={15} /> Export pilot data</button>}
    />

    <div className="settings-layout">
      <div className="settings-main">
        <Panel eyebrow="WORKSPACE" title="Pune operations">
          <div className="settings-profile">
            <span className="avatar large">PO</span>
            <div><strong>Pune Operations</strong><p>Municipal intelligence workspace · Zone 1–7</p></div>
            <Badge tone="green" dot>Pilot live</Badge>
          </div>
          <div className="settings-grid">
            <div className="setting-line"><span>Region</span><strong>Pune, Maharashtra</strong><small>Initial deployment city</small></div>
            <div className="setting-line"><span>Time zone</span><strong>Asia/Kolkata (IST)</strong><small>UTC +05:30</small></div>
            <div className="setting-line"><span>Data source</span><strong>{settings.dataSource}</strong><small>{hazards.length} hazard records</small></div>
            <div className="setting-line"><span>Fleet enrolment</span><strong>{vehicles.length} vehicles</strong><small>{vehicles.filter((vehicle) => vehicle.status === 'streaming').length} streaming now</small></div>
          </div>
        </Panel>

        <Panel eyebrow="DRIVER ALERTS" title="Alert behaviour">
          <div className="settings-row">
            <div><strong>Approach distance</strong><p>Vehicles receive the alert when they are within this distance of a verified hazard.</p></div>
            <div className="range-control"><input type="range" min={200} max={1500} step={50} value={settings.alertDistance} onChange={(event) => updateSettings({ alertDistance: Number(event.target.value) })} aria-label="Alert approach distance" /><b>{settings.alertDistance} m</b></div>
          </div>
          <div className="settings-row">
            <div><strong>Minimum severity for alerts</strong><p>Low-severity observations stay in the register without interrupting the drive.</p></div>
            <select value={settings.severityFloor} onChange={(event) => updateSettings({ severityFloor: event.target.value as Severity })}>{SEVERITIES.map((value) => <option key={value} value={value}>{SEVERITY_META[value].label} and above</option>)}</select>
          </div>
          <div className="settings-row">
            <div><strong>Voice alerts</strong><p>Speak the hazard, distance and recommended action when the phone is mounted.</p></div>
            <button className={`switch ${settings.voiceAlerts ? 'on' : ''}`} onClick={() => updateSettings({ voiceAlerts: !settings.voiceAlerts })} aria-pressed={settings.voiceAlerts}><i /></button>
          </div>
          <div className="settings-row">
            <div><strong>Distance units</strong><p>Applies to driver alerts and approach distances.</p></div>
            <div className="segmented small"><button className={settings.units === 'metric' ? 'active' : ''} onClick={() => updateSettings({ units: 'metric' })}>Metric</button><button className={settings.units === 'imperial' ? 'active' : ''} onClick={() => updateSettings({ units: 'imperial' })}>Imperial</button></div>
          </div>
        </Panel>

        <Panel eyebrow="DISPLAY" title="Map and interface">
          <div className="settings-row">
            <div><strong>Map style</strong><p>Applies to the live map, overview and hazard detail maps.</p></div>
            <div className="segmented small"><button className={settings.mapStyle === 'light' ? 'active' : ''} onClick={() => updateSettings({ mapStyle: 'light' })}>Light</button><button className={settings.mapStyle === 'dark' ? 'active' : ''} onClick={() => updateSettings({ mapStyle: 'dark' })}>Dark</button></div>
          </div>
          <div className="settings-row">
            <div><strong>Privacy mode</strong><p>Show only hazard evidence. Driver identity and continuous footage are never displayed.</p></div>
            <Badge tone="green"><Icon name="shield" size={12} /> Enforced</Badge>
          </div>
        </Panel>

        <Panel eyebrow="DATA CONNECTION" title="EDAS API">
          <div className="api-head"><div><strong>Live API records</strong><p>Connect the workspace to the FastAPI service to review authenticated hazard records instead of the pilot dataset.</p></div><Badge tone={apiState === 'connected' ? 'green' : apiState === 'error' ? 'red' : 'slate'} dot>{apiState === 'connected' ? 'Connected' : apiState === 'connecting' ? 'Connecting' : apiState === 'error' ? 'Error' : 'Pilot dataset'}</Badge></div>
          <label className="field"><span>API base URL</span><input value={settings.apiBase} onChange={(event) => updateSettings({ apiBase: event.target.value })} placeholder="http://localhost:8000/api/v1" /></label>
          <label className="field"><span>Supabase access token</span><textarea rows={2} value={apiToken} onChange={(event) => setApiToken(event.target.value)} placeholder="eyJ…" spellCheck={false} autoComplete="off" /><small>Kept in memory for this session. Sent only to the API base above.</small></label>
          {apiMessage && <div className={`api-message ${apiState === 'error' ? 'error' : ''}`}><Icon name={apiState === 'error' ? 'alert' : 'check'} size={14} /> {apiMessage}</div>}
          <div className="settings-actions">
            <button className="btn btn-dark" onClick={() => { void connectApi(apiToken); }} disabled={apiState === 'connecting'}>{apiState === 'connecting' ? 'Connecting…' : 'Connect and sync'}</button>
            {settings.dataSource === 'EDAS API' && <button className="btn btn-outline" onClick={disconnectApi}>Disconnect and restore pilot data</button>}
          </div>
        </Panel>

        <Panel eyebrow="DATA MANAGEMENT" title="Workspace data">
          <div className="danger-row">
            <div><strong>Reset pilot workspace</strong><p>Restore the reference Pune dataset, clear acknowledged alerts and reset preferences.</p></div>
            <button className="btn btn-danger" onClick={() => { if (window.confirm('Reset the pilot workspace to the reference dataset?')) resetPilot(); }}>Reset workspace</button>
          </div>
        </Panel>
      </div>

      <aside className="settings-side">
        <Panel eyebrow="BUILD" title="EDAS workspace">
          <div className="build-list">
            <div><span>Release</span><strong>2.4.0 · Pune pilot</strong></div>
            <div><span>Road-damage model</span><strong>YOLOv8s-road</strong></div>
            <div><span>Alert policy</span><strong>Safety-first v0.4</strong></div>
            <div><span>Sampling target</span><strong>10 fps · 640 px</strong></div>
            <div><span>Hazard matching</span><strong>35 m radius</strong></div>
            <div><span>Fleet</span><strong>12 enrolled vehicles</strong></div>
          </div>
          <div className="build-note"><Icon name="shield" size={14} /><span>Safety constraint: alerts are advisory. EDAS never controls steering, braking or throttle.</span></div>
        </Panel>

        <div className="settings-help">
          <Icon name="sparkles" size={18} />
          <h3>Workspace controls</h3>
          <p>Every switch on this page updates the workspace immediately: alert distances in Driver Assistance, map styling across all maps and API sync in the register.</p>
        </div>

        <div className="settings-help muted-card">
          <Icon name="camera" size={18} />
          <h3>Reference media</h3>
          <p>Vision Lab plays the corridor source and its annotated output from <code>/public/media</code>. Swap both files with the final fixed footage to keep the same timeline structure.</p>
        </div>
      </aside>
    </div>
  </>;
}
