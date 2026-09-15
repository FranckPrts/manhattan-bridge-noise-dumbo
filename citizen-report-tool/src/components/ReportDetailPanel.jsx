import {
  SOUND_CHARACTERS,
  DURATION_PATTERNS,
  RECURRING_OPTIONS,
  BEHAVIORAL_RESPONSES,
  labelFor,
  labelsFor,
} from '../lib/reportFields.js';
import SpectrogramView from './SpectrogramView.jsx';

export const KIND_ICON = { audio: '🎙️', image: '📷', video: '🎥' };

export function MediaItem({ item }) {
  if (item.kind === 'audio') {
    return <audio controls src={item.url} />;
  }
  if (item.kind === 'image') {
    return <img src={item.url} alt="Report media" />;
  }
  if (item.kind === 'video') {
    return <video controls src={item.url} />;
  }
  return null;
}

export function Answers({ data }) {
  if (!data) return null;

  const rows = [
    ['Annoyance', `${data.annoyance}/10`],
    ['Interrupted', data.activity_interrupted],
    ['Direction', data.perceived_direction],
    ['Sounded like', labelsFor(SOUND_CHARACTERS, data.sound_character).join(', ') || '—'],
    ['Duration', labelFor(DURATION_PATTERNS, data.duration_pattern)],
    ['Pattern', labelFor(RECURRING_OPTIONS, data.recurring)],
    ['Felt vibration', data.felt_vibration ? 'Yes' : 'No'],
    ['Windows open', data.windows_open ? 'Yes' : 'No'],
    ['Response', labelsFor(BEHAVIORAL_RESPONSES, data.behavioral_response).join(', ') || 'None'],
    ['Notes', data.notes || '—'],
    ['Loud moments logged', data.marked_events?.length ? `${data.marked_events.length}` : '—'],
  ];

  return (
    <dl className="answers">
      {rows.map(([label, value]) => (
        <div key={label} className="answers-row">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// Full detail block for one report: timestamp, questionnaire answers,
// spectrogram (if present), media playback. Used by the citizen "My reports"
// preview and the admin map's cluster popover.
export default function ReportDetailPanel({ report }) {
  return (
    <>
      <p className="hint">{new Date(report.timestamp).toLocaleString()}</p>
      <Answers data={report.report_data} />
      {report.spectral && (
        <SpectrogramView data={report.spectral} events={report.report_data?.marked_events} />
      )}
      {report.media?.length > 0 && (
        <div className="report-media">
          {report.media.map((item, i) => (
            <MediaItem key={i} item={item} />
          ))}
        </div>
      )}
    </>
  );
}
