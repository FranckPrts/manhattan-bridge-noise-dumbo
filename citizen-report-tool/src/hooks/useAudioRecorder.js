import { useState, useRef, useCallback } from 'react';

const MAX_DURATION_SEC = 10;
const AUDIO_BITS_PER_SECOND = 128000; // 128 kbps — low bitrates (e.g. 48kbps) distort spectral content

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

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const startTimeRef = useRef(null);
  const autoStopTimerRef = useRef(null);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setAudioBlob(null);
    setAudioUrl(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, {
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
      };

      startTimeRef.current = Date.now();
      recorder.start();
      setStatus('recording');

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
  }, [audioUrl]);

  return { status, audioBlob, audioUrl, duration, error, start, stop, reset, maxDurationSec: MAX_DURATION_SEC };
}
