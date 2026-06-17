import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from './api';

interface ClockStatus {
  status: boolean;
  duration: string | null;
  clock_in: string | null;
  clock_in_iso: string | null;
  clock_out: string | null;
}

interface ClockResponse {
  message: string;
  geo_valid: boolean | null;
}

function parseDuration(d: string): number {
  const parts = d.split(':').map(Number);
  return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
}

export interface UseClockResult {
  isClockedIn: boolean;
  duration: string;
  clockInTime: string | null;
  clockOutTime: string | null;
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

  // ALD26: giờ công KHÔNG tick live theo phút — chỉ đổi theo lượt chấm (cập nhật khi
  // refresh sau mỗi lần chấm in/out, hoặc khi mở lại app). duration = span lượt cuối −
  // lượt đầu do backend trả; chưa chấm lượt nào hôm nay → 00:00:00.

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
    // When not clocked in and no clock_in today → show 00:00:00 (new day reset)
    duration: status?.status ? liveDuration : (status?.clock_in ? (status?.duration ?? '00:00:00') : '00:00:00'),
    clockInTime: status?.clock_in ?? null,
    clockOutTime: status?.clock_out ?? null,
    loading,
    acting,
    clockIn,
    clockOut,
    refresh,
  };
}
