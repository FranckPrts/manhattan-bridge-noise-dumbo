import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import ReportDetailPanel from '../components/ReportDetailPanel.jsx';

// Leaflet's default marker icon references image paths that break under a
// bundler; point them at the package's own bundled assets instead.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function ClusterPopover({ reports, onClose }) {
  const [expandedId, setExpandedId] = useState(null);

  return (
    <div className="map-popover">
      <div className="map-popover-header">
        <strong>{reports.length} report{reports.length === 1 ? '' : 's'}</strong>
        <button type="button" className="dismiss-button" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <ul className="reports-list">
        {reports.map((r) => {
          const expanded = expandedId === r.id;
          return (
            <li key={r.id} className="report-item">
              <div className="report-row">
                <span className="annoyance-badge">{r.report_data?.annoyance}/10</span>
                <span className="report-row-summary">
                  <strong>{r.report_data?.activity_interrupted}</strong> · {r.report_data?.perceived_direction}
                </span>
                <span className="timestamp">{new Date(r.timestamp).toLocaleDateString()}</span>
                <button type="button" className="preview-button" onClick={() => setExpandedId(expanded ? null : r.id)}>
                  {expanded ? 'Hide' : 'Preview'}
                </button>
              </div>
              {expanded && (
                <div className="report-details">
                  <ReportDetailPanel report={r} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function MapView({ reports }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [popoverReports, setPopoverReports] = useState(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    map.setView([40.706, -73.977], 14);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const withLocation = reports.filter((r) => typeof r.lat === 'number' && typeof r.lon === 'number');
    if (withLocation.length === 0) return undefined;

    const clusterGroup = L.markerClusterGroup({ zoomToBoundsOnClick: false });
    const reportById = new Map(withLocation.map((r) => [r.id, r]));

    withLocation.forEach((r) => {
      const marker = L.marker([r.lat, r.lon]);
      marker.reportId = r.id;
      marker.on('click', () => setPopoverReports([r]));
      clusterGroup.addLayer(marker);
    });

    clusterGroup.on('clusterclick', (e) => {
      const ids = e.layer.getAllChildMarkers().map((m) => m.reportId);
      setPopoverReports(ids.map((id) => reportById.get(id)).filter(Boolean));
    });

    map.addLayer(clusterGroup);
    map.fitBounds(L.latLngBounds(withLocation.map((r) => [r.lat, r.lon])), { padding: [30, 30] });

    return () => {
      map.removeLayer(clusterGroup);
    };
  }, [reports]);

  return (
    <div className="map-view">
      <div ref={containerRef} className="leaflet-container" />
      {popoverReports && (
        <ClusterPopover reports={popoverReports} onClose={() => setPopoverReports(null)} />
      )}
    </div>
  );
}
