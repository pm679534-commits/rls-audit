import {AuthShell} from '@/components/shells/auth-shell';

export default function AuthLayout({children}: {children: React.ReactNode}) {
  return <AuthShell>{children}</AuthShell>;
}
