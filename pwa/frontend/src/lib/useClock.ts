import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from './api';

interface ClockStatus {
  status: boolean;
  duration: string | null;
  clock_in: string | null;
  clock_in_iso: string | null;
}

interface ClockResponse {
  message: string;
  geo_valid: boolean | null;
}

function parseDuration(d: string): number {
  const parts = d.split(':').map(Number);
  return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
}

function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export interface UseClockResult {
  isClockedIn: boolean;
  duration: string;
  clockInTime: string | null;
  loading: boolean;
  acting: boolean;
  clockIn: (body?: Record<string, unknown>) => Promise<ClockResponse | null>;
  clockOut: (body?: Record<string, unknown>) => Promise<ClockResponse | null>;
  refresh: () => Promise<void>;
}

export function useClock(): UseClockResult {
  const [status, setStatus] = useState<ClockStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [liveDuration, setLiveDuration] = useState('00:00:00');
  const fetchedAt = useRef<number>(0);
  const baseSec = useRef<number>(0);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<ClockStatus>('/api/attendance/checking-in');
      fetchedAt.current = Date.now();
      baseSec.current = parseDuration(data.duration ?? '00:00:00');
      setLiveDuration(data.duration ?? '00:00:00');
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!status?.status) return;
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - fetchedAt.current) / 1000);
      setLiveDuration(formatDuration(baseSec.current + elapsed));
    }, 1000);
    return () => clearInterval(id);
  }, [status?.status]);

  const clockIn = useCallback(async (body?: Record<string, unknown>): Promise<ClockResponse | null> => {
    setActing(true);
    try {
      const res = await api.post<ClockResponse>('/api/attendance/clock-in/', body ?? {});
      await refresh();
      return res;
    } finally {
      setActing(false);
    }
  }, [refresh]);

  const clockOut = useCallback(async (body?: Record<string, unknown>): Promise<ClockResponse | null> => {
    setActing(true);
    try {
      const res = await api.post<ClockResponse>('/api/attendance/clock-out/', body ?? {});
      await refresh();
      return res;
    } finally {
      setActing(false);
    }
  }, [refresh]);

  return {
    isClockedIn: !!status?.status,
    duration: status?.status ? liveDuration : (status?.duration ?? '00:00:00'),
    clockInTime: status?.clock_in ?? null,
    loading,
    acting,
    clockIn,
    clockOut,
    refresh,
  };
}
