import { useState, useEffect, useCallback } from 'react';
import { api } from './api';

interface ClockStatus {
  status: boolean;
  duration: string | null;
  clock_in: string | null;
}

interface UseClockResult {
  isClockedIn: boolean;
  duration: string;
  clockInTime: string | null;
  loading: boolean;
  acting: boolean;
  clockIn: (body?: Record<string, unknown>) => Promise<void>;
  clockOut: (body?: Record<string, unknown>) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useClock(): UseClockResult {
  const [status, setStatus] = useState<ClockStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<ClockStatus>('/api/attendance/checking-in');
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const clockIn = useCallback(async (body?: Record<string, unknown>) => {
    setActing(true);
    try {
      await api.post('/api/attendance/clock-in/', body ?? {});
      await refresh();
    } finally {
      setActing(false);
    }
  }, [refresh]);

  const clockOut = useCallback(async (body?: Record<string, unknown>) => {
    setActing(true);
    try {
      await api.post('/api/attendance/clock-out/', body ?? {});
      await refresh();
    } finally {
      setActing(false);
    }
  }, [refresh]);

  return {
    isClockedIn: !!status?.status,
    duration: status?.duration ?? '00:00:00',
    clockInTime: status?.clock_in ?? null,
    loading,
    acting,
    clockIn,
    clockOut,
    refresh,
  };
}
