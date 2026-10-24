import 'server-only';

import {cache} from 'react';
import {createClient} from '@/lib/supabase/server';

export const unreadNotificationCount = cache(async (userId: string): Promise<number> => {
  const {count, error} = await (await createClient()).from('notifications')
    .select('id', {count: 'exact', head: true}).eq('user_id', userId).is('read_at', null);
  if (error) throw new Error('Could not load unread notifications');
  return count ?? 0;
});
