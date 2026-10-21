import {DashboardShell} from './dashboard-shell';
import type {ShellLink} from './marketing-shell';

export function AdminShell({children, navigation, title}: {children: React.ReactNode; navigation: ShellLink[]; title: string}) {
  return <DashboardShell navigation={navigation} title={title}>{children}</DashboardShell>;
}
