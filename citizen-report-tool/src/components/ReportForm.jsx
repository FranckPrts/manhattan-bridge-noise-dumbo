import { useState, useEffect, useRef } from 'react';
import { useGeolocation } from '../hooks/useGeolocation.js';
import { useAudioRecorder } from '../hooks/useAudioRecorder.js';
import { uploadMedia } from '../lib/uploadMedia.js';
import { analyzeAudioBlob } from '../lib/spectralAnalysis.js';
import LiveSpectrogram from './LiveSpectrogram.jsx';
import EventAnnotator from './EventAnnotator.jsx';
import {
  ACTIVITIES,
  DIRECTIONS,
  SOUND_CHARACTERS,
  DURATION_PATTERNS,
  RECURRING_OPTIONS,
  BEHAVIORAL_RESPONSES,
} from '../lib/reportFields.js';

function toggleValue(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function formatDuration(sec) {
  if (sec >= 60 && sec % 60 === 0) return `${sec / 60} minute${sec === 60 ? '' : 's'}`;
  if (sec >= 60) return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
  return `${sec}s`;
}

function ChipGroup({ options, selected, onToggle }) {
  return (
    <div className="chip-group">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`chip${selected.includes(opt.value) ? ' selected' : ''}`}
          onClick={() => onToggle(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// Mobile-friendly single-select tiles, replacing <select> dropdowns — one tap,
// no picker wheel/menu to open.
function TileGroup({ options, value, onSelect }) {
  return (
    <div className="tile-group">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`tile${value === opt.value ? ' selected' : ''}`}
          onClick={() => onSelect(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function ReportForm({ onSubmitted, accessToken }) {
  const [annoyance, setAnnoyance] = useState(5);
  const [activity, setActivity] = useState(ACTIVITIES[0].value);
  const [direction, setDirection] = useState(DIRECTIONS[4].value);
  const [soundCharacter, setSoundCharacter] = useState([]);
  const [durationPattern, setDurationPattern] = useState(DURATION_PATTERNS[0].value);
  const [recurring, setRecurring] = useState(RECURRING_OPTIONS[0].value);
  const [outdoors, setOutdoors] = useState(false);
  const [feltVibration, setFeltVibration] = useState(false);
  const [windowsOpen, setWindowsOpen] = useState(false);
  const [behavioralResponse, setBehavioralResponse] = useState([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [playbackTimeSec, setPlaybackTimeSec] = useState(0);
  const audioElRef = useRef(null);
  // Set only when replaying a specific window (a marker or a card's ▶); a
  // plain seek from clicking elsewhere on the spectrogram leaves this null
  // and just plays on normally.
  const stopAtSecRef = useRef(null);

  const { location, status: locStatus, error: locError, requestLocation } = useGeolocation();
  const {
    status: audioStatus,
    audioBlob,
    audioUrl,
    duration,
    error: audioError,
    stream: audioStream,
    events,
    setEvents,
    markStart,
    markEnd,
    pendingElapsedSec,
    recordingElapsedSec,
    start: startRecording,
    stop: stopRecording,
    reset: resetRecording,
    maxDurationSec,
  } = useAudioRecorder();

  const [spectralData, setSpectralData] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(null);

  useEffect(() => {
    if (!audioBlob) {
      setSpectralData(null);
      setAnalyzeError(null);
      return;
    }

    let cancelled = false;
    setAnalyzing(true);
    setAnalyzeError(null);

    analyzeAudioBlob(audioBlob)
      .then((result) => {
        if (!cancelled) setSpectralData(result);
      })
      .catch((err) => {
        if (!cancelled) setAnalyzeError(err.message);
      })
      .finally(() => {
        if (!cancelled) setAnalyzing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [audioBlob]);

  const canSubmit = location && !submitting;

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoFile(file);
    setPhotoUrl(URL.createObjectURL(file));
  };

  const clearPhoto = () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoFile(null);
    setPhotoUrl(null);
  };

  // Press = quick tap (short range), hold = longer range — same markStart/
  // markEnd either way. Pointer capture keeps the release event bound to
  // this button even if a finger drags off it mid-hold, a common touchscreen
  // failure mode for press-and-hold controls.
  const handleHoldStart = (e) => {
    e.preventDefault(); // blocks the ~500-700ms long-press-to-context-menu gesture from hijacking the hold
    e.currentTarget.setPointerCapture(e.pointerId);
    markStart();
  };
  const handleHoldEnd = (e) => {
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    markEnd();
  };
  // Belt-and-braces: some mobile browsers still fire this after a sustained
  // press even with touch-action: none and preventDefault() on pointerdown.
  const suppressContextMenu = (e) => e.preventDefault();

  // Lets the annotation screen play back from any clicked point on the
  // spectrogram (or a card's ▶ button), so a citizen can confirm what a
  // captured moment actually sounds like before categorizing it. An
  // optional `endSec` (passed for a marker tap or a card's ▶ — never for a
  // plain click elsewhere on the trace) makes this replay just that window:
  // onTimeUpdate below pauses playback once it's reached, so a 2s screech
  // doesn't run on into the next 8s of clip.
  const seekAndPlay = (startSec, endSec) => {
    const audio = audioElRef.current;
    if (!audio) return;
    stopAtSecRef.current = typeof endSec === 'number' ? endSec : null;
    audio.currentTime = startSec;
    // Clicking a second marker/card before the first's play() has settled
    // makes the browser reject that first promise (AbortError, "interrupted
    // by a new load request") — harmless, but unhandled it surfaces as a
    // console/dev-overlay error and can leave the element looking stuck.
    // Swallowing it here is what lets rapid re-clicking always just work:
    // seek + play, every time, regardless of what was mid-flight before.
    audio.play().catch(() => {});
  };

  const handlePlaybackTimeUpdate = (e) => {
    setPlaybackTimeSec(e.target.currentTime);
    if (stopAtSecRef.current != null && e.target.currentTime >= stopAtSecRef.current) {
      e.target.pause();
    }
  };

  // Forget any pending stop point once playback actually pauses (whether
  // that's us stopping it above or the citizen hitting pause themselves) —
  // otherwise resuming with the native play button would get cut short
  // again at a stale end time from a previous replay.
  const handlePlaybackPause = () => {
    stopAtSecRef.current = null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!location) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const reportData = {
        annoyance: Number(annoyance),
        activity_interrupted: activity,
        perceived_direction: direction,
        sound_character: soundCharacter,
        duration_pattern: durationPattern,
        recurring,
        outdoors,
        felt_vibration: outdoors ? false : feltVibration,
        windows_open: outdoors ? false : windowsOpen,
        behavioral_response: behavioralResponse,
        notes: notes.trim() || null,
        marked_events: events.length > 0 ? events : undefined,
      };

      const payload = {
        timestamp: new Date().toISOString(),
        location,
        report_data: reportData,
        device: navigator.userAgent,
      };

      if (spectralData) {
        payload.spectral = spectralData;
      }

      const media = [];
      if (audioBlob) {
        media.push(await uploadMedia(audioBlob, { kind: 'audio', durationSec: duration, accessToken }));
      }
      if (photoFile) {
        media.push(await uploadMedia(photoFile, { kind: 'image', accessToken }));
      }
      if (media.length > 0) {
        payload.media = media;
      }

      const res = await fetch('/api/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Submission failed (${res.status})`);
      }

      await res.json();

      onSubmitted();

      // Reset form for next report
      setAnnoyance(5);
      setActivity(ACTIVITIES[0].value);
      setDirection(DIRECTIONS[4].value);
      setSoundCharacter([]);
      setDurationPattern(DURATION_PATTERNS[0].value);
      setRecurring(RECURRING_OPTIONS[0].value);
      setOutdoors(false);
      setFeltVibration(false);
      setWindowsOpen(false);
      setBehavioralResponse([]);
      setNotes('');
      resetRecording();
      clearPhoto();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="report-form" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="annoyance">
          How annoying is the noise right now? <strong>{annoyance}</strong>/10
        </label>
        <input
          id="annoyance"
          type="range"
          min="0"
          max="10"
          value={annoyance}
          onChange={(e) => setAnnoyance(e.target.value)}
        />
      </div>

      <div className="field">
        <label>What did it sound like?</label>
        <ChipGroup
          options={SOUND_CHARACTERS}
          selected={soundCharacter}
          onToggle={(v) => setSoundCharacter((prev) => toggleValue(prev, v))}
        />
      </div>

      <div className="field">
        <label>How long did it last?</label>
        <TileGroup options={DURATION_PATTERNS} value={durationPattern} onSelect={setDurationPattern} />
      </div>

      <div className="field">
        <label>Is this a one-off or a pattern?</label>
        <TileGroup options={RECURRING_OPTIONS} value={recurring} onSelect={setRecurring} />
      </div>

      <div className="field">
        <label>What did it interrupt?</label>
        <TileGroup options={ACTIVITIES} value={activity} onSelect={setActivity} />
      </div>

      <div className="field">
        <label>Where did it seem to come from?</label>
        <TileGroup options={DIRECTIONS} value={direction} onSelect={setDirection} />
      </div>

      <div className="field">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={outdoors}
            onChange={(e) => {
              const checked = e.target.checked;
              setOutdoors(checked);
              // Vibration and window state are indoor concepts — clear them
              // rather than leaving stale checked values sitting disabled.
              if (checked) {
                setFeltVibration(false);
                setWindowsOpen(false);
              }
            }}
          />
          I was outdoors
        </label>
        <label className={`checkbox-row${outdoors ? ' disabled' : ''}`}>
          <input
            type="checkbox"
            checked={feltVibration}
            disabled={outdoors}
            onChange={(e) => setFeltVibration(e.target.checked)}
          />
          I felt vibration (windows/floor rattling, structure shaking)
        </label>
        <label className={`checkbox-row${outdoors ? ' disabled' : ''}`}>
          <input
            type="checkbox"
            checked={windowsOpen}
            disabled={outdoors}
            onChange={(e) => setWindowsOpen(e.target.checked)}
          />
          My windows were open at the time
        </label>
      </div>

      <div className="field">
        <label>Did you do anything in response? (optional)</label>
        <ChipGroup
          options={BEHAVIORAL_RESPONSES}
          selected={behavioralResponse}
          onToggle={(v) => setBehavioralResponse((prev) => toggleValue(prev, v))}
        />
      </div>

      <div className="field">
        <label htmlFor="notes">Anything else worth noting? (optional)</label>
        <textarea
          id="notes"
          rows="2"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. which track, what the train looked like, anything unusual"
        />
      </div>

      <div className="field">
        <label>Location</label>
        {locStatus === 'ready' && location ? (
          <p className="hint success">
            ✓ {location.lat.toFixed(5)}, {location.lon.toFixed(5)}
          </p>
        ) : (
          <button type="button" onClick={requestLocation} disabled={locStatus === 'locating'}>
            {locStatus === 'locating' ? 'Locating…' : 'Get my location'}
          </button>
        )}
        {locStatus === 'error' && <p className="hint error">✗ {locError}</p>}
      </div>

      <div className="field">
        <label>Sound (optional, up to {formatDuration(maxDurationSec)})</label>
        {audioStatus === 'idle' && (
          <>
            <p className="hint">You'll have {formatDuration(maxDurationSec)} to record — plenty of time to catch the whole pass.</p>
            <button type="button" onClick={startRecording}>● Record</button>
          </>
        )}
        {audioStatus === 'recording' && (
          <div className="recording-live">
            <LiveSpectrogram stream={audioStream} />
            <p className="hint countdown">
              ⏱ {formatDuration(Math.max(0, Math.round(maxDurationSec - recordingElapsedSec)))} left — just notice when it's loud
            </p>
            <button
              type="button"
              className={`hold-button${pendingElapsedSec != null ? ' active' : ''}`}
              onPointerDown={handleHoldStart}
              onPointerUp={handleHoldEnd}
              onPointerCancel={handleHoldEnd}
              onContextMenu={suppressContextMenu}
            >
              {pendingElapsedSec != null ? `🔊 Holding… ${pendingElapsedSec.toFixed(1)}s` : '🔊 Hold while it\'s loud'}
            </button>
            {events.length > 0 && (
              <p className="hint">{events.length} loud moment{events.length > 1 ? 's' : ''} captured</p>
            )}
            <button type="button" className="stop-button" onClick={stopRecording}>■ Stop early</button>
          </div>
        )}
        {audioStatus === 'recorded' && (
          <div className="audio-preview">
            <audio
              ref={audioElRef}
              controls
              src={audioUrl}
              onTimeUpdate={handlePlaybackTimeUpdate}
              onSeeked={(e) => setPlaybackTimeSec(e.target.currentTime)}
              onPause={handlePlaybackPause}
            />
            <p className="hint">{duration.toFixed(1)}s recorded</p>
            {analyzing && <p className="hint">Analyzing sound…</p>}
            {analyzeError && <p className="hint error">✗ Spectral analysis failed: {analyzeError}</p>}
            {spectralData && !analyzing && (
              <p className="hint success">
                ✓ Sound analyzed ({spectralData.band_scheme}
                {spectralData.event ? `, event detected ${spectralData.summary.event_duration_sec.toFixed(1)}s` : ''})
              </p>
            )}
            <button type="button" onClick={resetRecording}>Re-record</button>
          </div>
        )}
        {spectralData && !analyzing && (
          <EventAnnotator
            spectral={spectralData}
            events={events}
            onEventsChange={setEvents}
            onSeek={seekAndPlay}
            playbackTimeSec={playbackTimeSec}
          />
        )}
        {audioStatus === 'error' && <p className="hint error">✗ {audioError}</p>}
      </div>

      <div className="field">
        <label>Photo (optional)</label>
        {photoUrl ? (
          <div className="media-preview">
            <img src={photoUrl} alt="Captured evidence" />
            <button type="button" onClick={clearPhoto}>Remove photo</button>
          </div>
        ) : (
          <label className="file-button">
            📷 Add photo
            <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} hidden />
          </label>
        )}
      </div>

      {submitError && <p className="hint error">✗ {submitError}</p>}

      <button type="submit" className="submit" disabled={!canSubmit}>
        {submitting ? 'Submitting…' : 'Submit report'}
      </button>
    </form>
  );
}
