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
  /** true = chưa xác nhận được trạng thái với server (fetch lỗi, hoặc app vừa
   *  quay lại foreground và refresh chưa về). KHÔNG được chấm khi đang stale:
   *  nút sẽ hiện sai chiều in/out và gửi nhầm lệnh. */
  stale: boolean;
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
  const [stale, setStale] = useState(true);
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
      setStale(false);
    } catch {
      // GIỮ trạng thái cũ. Trước đây setStatus(null) khiến isClockedIn=false,
      // tức "không gọi được server" bị coi là "chưa chấm vào" → nút hiện
      // "Chấm vào" → NV đang trong ca bấm vào thì server trả 400
      // 'Already clocked-in' (hoặc tệ hơn: mở ca mới, treo qua đêm).
      setStale(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // PWA đã cài nằm nền cả ngày và KHÔNG remount, nên trạng thái chấm lấy lúc
  // sáng vẫn còn nguyên lúc tan làm — trong khi server đã đổi (chấm bằng máy
  // vân tay, lượt nghỉ trưa...). Đó là lỗi 21/08/2026: 30 ca bị mở nhầm lúc
  // 17h+ và 10 lượt 400 'Already clocked-in'. Nạp lại mỗi khi app hiện lại.
  // pageshow bắt thêm trường hợp iOS khôi phục từ bfcache (visibilitychange
  // không phải lúc nào cũng bắn).
  useEffect(() => {
    const onResume = () => {
      if (document.visibilityState !== 'visible') return;
      setStale(true);   // chặn chấm cho tới khi xác nhận lại được với server
      refresh();
    };
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) onResume(); };
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [refresh]);

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
    stale,
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
