import { useCallback, useEffect, useRef, useState } from 'react';
import type { Notification } from '../types';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../lib/api';

const POLL_MS = 60_000;

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const refetch = useCallback(async () => {
    try {
      const { data, unreadCount } = await getNotifications();
      if (!mounted.current) return;
      setNotifications(data);
      setUnreadCount(unreadCount);
    } catch {
      // Polling failure is non-fatal — keep last known state.
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refetch();
    const id = setInterval(refetch, POLL_MS);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [refetch]);

  const markRead = useCallback(
    async (id: string) => {
      await markNotificationRead(id);
      await refetch();
    },
    [refetch]
  );

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead();
    await refetch();
  }, [refetch]);

  return { notifications, unreadCount, loading, markRead, markAllRead, refetch };
}
