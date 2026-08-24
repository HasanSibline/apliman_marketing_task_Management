import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/services/api';

export interface AiUsage {
  CHAT: number;
  TASK_GENERATION: number;
  SUBTASK_GENERATION: number;
  MEETING_SUMMARY: number;
}

export interface AiStatus {
  aiEnabled: boolean;
  quotaExhausted: boolean;
  quotaResetAt: string | null; // ISO string; null when AI is not rate limited
  provider: string;
  myUsage: Partial<AiUsage>;
  isLoading: boolean;
  /** Human-readable countdown string, e.g. "42 minutes" */
  resetCountdown: string | null;
  /** Refresh the status immediately */
  refresh: () => void;
}

const POLL_INTERVAL_MS = 60_000; // poll every 60 s

function formatCountdown(resetAt: string): string {
  const diff = new Date(resetAt).getTime() - Date.now();
  if (diff <= 0) return 'now';
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function useAiStatus(): AiStatus {
  const [status, setStatus] = useState<Omit<AiStatus, 'isLoading' | 'resetCountdown' | 'refresh'>>({
    aiEnabled: true,
    quotaExhausted: false,
    quotaResetAt: null,
    provider: 'gemini',
    myUsage: {},
  });
  const [isLoading, setIsLoading] = useState(true);
  const [resetCountdown, setResetCountdown] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Guards every setState behind an await, so a poll in flight at unmount is inert. */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await api.get('/ai/quota-status', { quiet: true });
      if (alive.current) setStatus(response.data);
    } catch {
      // If the endpoint fails, don't block the UI, assume AI is enabled. Quiet on
      // purpose: this is a background poll nobody asked for, and a cold backend
      // raising a toast every sixty seconds is noise about a state the UI already
      // shows.
    } finally {
      if (alive.current) setIsLoading(false);
    }
  }, []);

  // Live countdown ticker
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);

    if (status.quotaExhausted && status.quotaResetAt) {
      const update = () => {
        const remaining = new Date(status.quotaResetAt!).getTime() - Date.now();
        if (remaining <= 0) {
          setResetCountdown(null);
          // Re-fetch, quota should be cleared server-side by now
          fetchStatus();
          clearInterval(countdownRef.current!);
        } else {
          setResetCountdown(formatCountdown(status.quotaResetAt!));
        }
      };
      update();
      countdownRef.current = setInterval(update, 1000);
    } else {
      setResetCountdown(null);
    }

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [status.quotaExhausted, status.quotaResetAt, fetchStatus]);

  // Polling. Nothing goes out while the tab is in the background: the answer is only
  // ever used to label a control nobody can see, and the backend sleeps on Render, so
  // a forgotten tab was paying to keep it awake once a minute all day. Coming back to
  // the tab asks immediately, so what is on screen is never the stale value.
  useEffect(() => {
    const poll = () => {
      if (!document.hidden) fetchStatus();
    };

    fetchStatus();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);

    const onVisible = () => {
      if (!document.hidden) fetchStatus();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchStatus]);

  return {
    ...status,
    isLoading,
    resetCountdown,
    refresh: fetchStatus,
  };
}
