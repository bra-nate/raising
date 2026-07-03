import type { ComponentType, SVGProps } from 'react';
import type { UserRole } from '../types';
import { IconGrid, IconUsers, IconPeople, IconPhone, IconActivity, IconSettings } from '../components/ui/icons';

export interface NavItem {
  label: string;
  to?: string; // present = live route; absent = upcoming
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  phase?: number; // shown as an "upcoming" hint
}

export interface NavGroup {
  heading?: string;
  items: NavItem[];
}

// Nav is role-scoped. Live items link; upcoming items surface the roadmap
// so the shell reads as a real product rather than a stub.
export function navForRole(role: UserRole): NavGroup[] {
  switch (role) {
    case 'superadmin':
      return [
        { items: [{ label: 'Dashboard', to: '/admin', icon: IconGrid }] },
        {
          heading: 'Admin',
          items: [
            { label: 'Users', to: '/admin/users', icon: IconUsers },
            { label: 'Activity Log', to: '/admin/logs', icon: IconActivity },
            { label: 'Settings', to: '/admin/settings', icon: IconSettings },
          ],
        },
      ];
    case 'pastor':
      return [
        { items: [{ label: 'Dashboard', to: '/pastor', icon: IconGrid }] },
        {
          heading: 'Records',
          items: [
            { label: 'Members', icon: IconPeople, phase: 3 },
            { label: 'First-Timers', icon: IconPhone, phase: 4 },
          ],
        },
        {
          heading: 'Admin',
          items: [
            { label: 'Users', to: '/pastor/users', icon: IconUsers },
            { label: 'Activity Log', to: '/pastor/logs', icon: IconActivity },
            { label: 'Settings', to: '/pastor/settings', icon: IconSettings },
          ],
        },
      ];
    case 'leader':
      return [
        { items: [{ label: 'Dashboard', to: '/leader', icon: IconGrid }] },
        {
          heading: 'Care',
          items: [{ label: 'My Members', to: '/leader/members', icon: IconPeople }],
        },
      ];
    case 'followup_team_lead':
    case 'followup_team_member':
      return [
        { items: [{ label: 'Dashboard', to: '/followup', icon: IconGrid }] },
        {
          heading: 'Follow-up',
          items: [{ label: 'First-Timers', icon: IconPhone, phase: 4 }],
        },
      ];
    default:
      return [];
  }
}
