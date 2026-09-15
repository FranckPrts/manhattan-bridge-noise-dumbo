import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DBFS_MIN = -80;
const DBFS_MAX = 0;

function colorForLevel(dbfs) {
  const t = Math.min(1, Math.max(0, (dbfs - DBFS_MIN) / (DBFS_MAX - DBFS_MIN)));
  const hue = 240 * (1 - t); // blue (quiet) → red (loud), matches SpectrogramView
  return `hsl(${hue}, 90%, 45%)`;
}

export default function GeoSpectralOverlay({ reports }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

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
    if (!map) return undefined;

    const withData = reports.filter(
      (r) => typeof r.lat === 'number' && typeof r.lon === 'number' && typeof r.spectral?.summary?.peak_dbfs === 'number'
    );
    if (withData.length === 0) return undefined;

    const layerGroup = L.layerGroup();
    withData.forEach((r) => {
      const color = colorForLevel(r.spectral.summary.peak_dbfs);
      const marker = L.circleMarker([r.lat, r.lon], {
        radius: 8,
        color,
        fillColor: color,
        fillOpacity: 0.8,
        weight: 1,
      });
      marker.bindTooltip(`${r.spectral.summary.peak_dbfs.toFixed(1)} dBFS`);
      layerGroup.addLayer(marker);
    });

    layerGroup.addTo(map);
    map.fitBounds(L.latLngBounds(withData.map((r) => [r.lat, r.lon])), { padding: [30, 30] });

    return () => {
      map.removeLayer(layerGroup);
    };
  }, [reports]);

  const hasData = reports.some((r) => typeof r.spectral?.summary?.peak_dbfs === 'number');

  return (
    <div className="map-view">
      <div ref={containerRef} className="leaflet-container" />
      {hasData && (
        <div className="map-legend">
          <span>Quiet</span>
          <div className="map-legend-gradient" />
          <span>Loud (relative)</span>
        </div>
      )}
    </div>
  );
}
