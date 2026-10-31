import 'server-only';

import {cache} from 'react';
import {createClient} from '@/lib/supabase/server';

export const unreadNotificationCount = cache(async (userId: string): Promise<number> => {
  const {data, error} = await (await createClient()).from('notifications')
    .select('id').eq('user_id', userId).is('read_at', null).limit(100);
  if (error) throw new Error('Could not load unread notifications');
  return data?.length ?? 0;
});
