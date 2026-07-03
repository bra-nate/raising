import type { UserRole } from '../types';

// The dashboard root path for each role.
export function homePathForRole(role: UserRole): string {
  switch (role) {
    case 'pastor':
      return '/pastor';
    case 'leader':
      return '/leader';
    case 'followup_team_lead':
    case 'followup_team_member':
      return '/followup';
    default:
      return '/login';
  }
}

export const roleLabels: Record<UserRole, string> = {
  pastor: 'Pastor',
  leader: 'Leader',
  followup_team_lead: 'Follow-Up Team Lead',
  followup_team_member: 'Follow-Up Team Member',
};
