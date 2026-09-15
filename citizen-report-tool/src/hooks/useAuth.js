import { useState, useEffect, useCallback } from 'react';
import { getBrowserSupabase } from '../lib/supabaseClient.js';

// Anonymous auth: the browser gets a persistent identity automatically, no
// login screen, no email. Reports are owned by that identity so "My reports"
// survives reloads/restarts on this device — it does not follow the user to
// another device or browser.
export function useAuth() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = signed out
  const [error, setError] = useState(null);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    let cancelled = false;

    async function ensureSession() {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        if (!cancelled) setSession(data.session);
        return;
      }

      const { data: signInData, error: signInError } = await supabase.auth.signInAnonymously();
      if (cancelled) return;
      if (signInError) {
        setError(signInError.message);
        return;
      }
      setSession(signInData.session);
    }

    ensureSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!cancelled) setSession(newSession);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  // Links an email to the current anonymous identity (opt-in backup path).
  // Supabase sends a confirmation link to that address; only once clicked
  // does the account stop being anonymous and `user.email` become set —
  // onAuthStateChange above picks that up automatically when the user
  // returns to the app.
  const linkEmail = useCallback(async (email) => {
    const supabase = getBrowserSupabase();
    const { error: linkError } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: window.location.origin }
    );
    if (linkError) {
      return { ok: false, error: linkError.message };
    }
    return { ok: true };
  }, []);

  return {
    session,
    user: session?.user ?? null,
    accessToken: session?.access_token ?? null,
    loading: session === undefined,
    error,
    linkEmail,
  };
}
