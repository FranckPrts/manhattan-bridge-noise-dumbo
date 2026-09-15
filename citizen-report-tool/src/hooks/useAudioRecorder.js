import { useState, useRef, useCallback, useEffect } from 'react';

const MAX_DURATION_SEC = 60;
const AUDIO_BITS_PER_SECOND = 128000; // 128 kbps — low bitrates (e.g. 48kbps) distort spectral content
const PENDING_TICK_MS = 100; // how often "holding…" duration refreshes in the UI
const RECORDING_TICK_MS = 200; // how often the "time left" countdown refreshes

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
];

function pickMimeType() {
  for (const type of PREFERRED_MIME_TYPES) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

export function useAudioRecorder() {
  const [status, setStatus] = useState('idle'); // idle | recording | recorded | error
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);
  const [stream, setStream] = useState(null); // exposed live for LiveSpectrogram, a second non-destructive consumer

  // Citizen-captured loud moments: a quick tap of the hold-button produces a
  // short range, holding it down produces a longer one — same shape either
  // way, "point vs. range" is just range length. `type` is filled in later,
  // on the post-recording annotation screen, not live.
  const [events, setEvents] = useState([]);
  const [pendingElapsedSec, setPendingElapsedSec] = useState(null); // non-null while the hold-button is pressed
  const [recordingElapsedSec, setRecordingElapsedSec] = useState(0); // ticks during recording, drives the "time left" countdown

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const startTimeRef = useRef(null);
  const autoStopTimerRef = useRef(null);
  const pendingStartRef = useRef(null);
  const pendingTickRef = useRef(null);
  const recordingTickRef = useRef(null);

  const elapsedSec = useCallback(() => (Date.now() - startTimeRef.current) / 1000, []);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (recordingTickRef.current) {
      clearInterval(recordingTickRef.current);
      recordingTickRef.current = null;
    }
  }, []);

  const markStart = useCallback(() => {
    if (!startTimeRef.current || pendingStartRef.current != null) return;
    pendingStartRef.current = elapsedSec();
    setPendingElapsedSec(0);
    pendingTickRef.current = setInterval(() => {
      setPendingElapsedSec(elapsedSec() - pendingStartRef.current);
    }, PENDING_TICK_MS);
  }, [elapsedSec]);

  const markEnd = useCallback(() => {
    if (pendingStartRef.current == null) return;
    const startSec = pendingStartRef.current;
    const endSec = elapsedSec();
    pendingStartRef.current = null;
    if (pendingTickRef.current) {
      clearInterval(pendingTickRef.current);
      pendingTickRef.current = null;
    }
    setPendingElapsedSec(null);
    setEvents((prev) => [...prev, { start_sec: startSec, end_sec: endSec, type: null }]);
  }, [elapsedSec]);

  const start = useCallback(async () => {
    setError(null);
    setAudioBlob(null);
    setAudioUrl(null);
    setEvents([]);
    pendingStartRef.current = null;
    setPendingElapsedSec(null);
    setRecordingElapsedSec(0);
    chunksRef.current = [];

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = mediaStream;
      setStream(mediaStream);

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(mediaStream, {
        mimeType: mimeType || undefined,
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setDuration((Date.now() - startTimeRef.current) / 1000);
        setStatus('recorded');

        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setStream(null);
      };

      startTimeRef.current = Date.now();
      recorder.start();
      setStatus('recording');
      recordingTickRef.current = setInterval(() => {
        setRecordingElapsedSec(elapsedSec());
      }, RECORDING_TICK_MS);

      autoStopTimerRef.current = setTimeout(stop, MAX_DURATION_SEC * 1000);
    } catch (err) {
      setStatus('error');
      setError(err.message);
    }
  }, [stop]);

  const reset = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
    setStatus('idle');
    setError(null);
    setEvents([]);
    pendingStartRef.current = null;
    setPendingElapsedSec(null);
    setRecordingElapsedSec(0);
    if (recordingTickRef.current) {
      clearInterval(recordingTickRef.current);
      recordingTickRef.current = null;
    }
  }, [audioUrl]);

  useEffect(() => () => {
    if (pendingTickRef.current) clearInterval(pendingTickRef.current);
    if (recordingTickRef.current) clearInterval(recordingTickRef.current);
  }, []);

  return {
    status,
    audioBlob,
    audioUrl,
    duration,
    error,
    stream,
    events,
    setEvents,
    markStart,
    markEnd,
    pendingElapsedSec,
    recordingElapsedSec,
    start,
    stop,
    reset,
    maxDurationSec: MAX_DURATION_SEC,
  };
}
