import { useState } from 'react';
import MapView from './MapView.jsx';
import RawDataTable from './RawDataTable.jsx';
import EventHistograms from './EventHistograms.jsx';
import AnnoyanceScatter from './AnnoyanceScatter.jsx';
import GeoSpectralOverlay from './GeoSpectralOverlay.jsx';

const SECTIONS = [
  { id: 'map', label: 'Map' },
  { id: 'raw', label: 'Raw data' },
  { id: 'charts', label: 'Charts' },
  { id: 'geospectral', label: 'Geo × spectral' },
];

export default function AdminDashboard({ reports, onLogout, onRefresh }) {
  const [section, setSection] = useState('map');

  return (
    <div>
      <div className="account-bar">
        <span className="hint">{reports.length} report{reports.length === 1 ? '' : 's'}</span>
        <div>
          <button type="button" onClick={onRefresh}>Refresh</button>
          <button type="button" onClick={onLogout}>Sign out</button>
        </div>
      </div>

      <h1>Admin</h1>

      <nav className="tabs">
        {SECTIONS.map((s) => (
          <button key={s.id} className={section === s.id ? 'active' : ''} onClick={() => setSection(s.id)}>
            {s.label}
          </button>
        ))}
      </nav>

      {section === 'map' && <MapView reports={reports} />}
      {section === 'raw' && <RawDataTable reports={reports} />}
      {section === 'charts' && (
        <>
          <EventHistograms reports={reports} />
          <AnnoyanceScatter reports={reports} />
        </>
      )}
      {section === 'geospectral' && <GeoSpectralOverlay reports={reports} />}
    </div>
  );
}
