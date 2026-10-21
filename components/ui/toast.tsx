'use client';

import {Toaster as Sonner, toast} from 'sonner';
import {useTheme} from 'next-themes';

export {toast};
export function Toaster(props: React.ComponentProps<typeof Sonner>) {
  const {resolvedTheme} = useTheme();
  return <Sonner theme={resolvedTheme === 'dark' ? 'dark' : 'light'} closeButton {...props} />;
}
