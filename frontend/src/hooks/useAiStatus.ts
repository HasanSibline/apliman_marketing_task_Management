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
  quotaResetAt: string | null; // ISO string or null (free tier = null = permanent)
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

  const fetchStatus = useCallback(async () => {
    try {
      const response = await api.get('/ai/quota-status');
      setStatus(response.data);
    } catch {
      // If the endpoint fails, don't block the UI — assume AI is enabled
    } finally {
      setIsLoading(false);
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
          // Re-fetch — quota should be cleared server-side by now
          fetchStatus();
          clearInterval(countdownRef.current!);
        } else {
          setResetCountdown(formatCountdown(status.quotaResetAt!));
        }
      };
      update();
      countdownRef.current = setInterval(update, 1000);
    } else if (status.quotaExhausted && !status.quotaResetAt) {
      // Free tier — permanently exhausted
      setResetCountdown(null);
    } else {
      setResetCountdown(null);
    }

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [status.quotaExhausted, status.quotaResetAt, fetchStatus]);

  // Polling
  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchStatus]);

  return {
    ...status,
    isLoading,
    resetCountdown,
    refresh: fetchStatus,
  };
}
