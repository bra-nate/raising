import { Link } from 'react-router-dom';
import { Button, Card } from '../ui';
import type { DuplicateMemberMatch } from '../../lib/api';

interface DuplicateMemberWarningProps {
  matches: DuplicateMemberMatch[];
  profilePath: (id: string) => string;
  isSubmitting: boolean;
  onCreateAnyway: () => void;
}

export function DuplicateMemberWarning({
  matches,
  profilePath,
  isSubmitting,
  onCreateAnyway,
}: DuplicateMemberWarningProps) {
  return (
    <div role="alert">
      <Card className="border-attention/40 bg-attention/5 p-4">
        <h2 className="text-body font-semibold text-ink-2">Possible duplicate</h2>
        <p className="mt-1 text-caption text-muted">This phone number is already attached to:</p>
        <ul className="mt-3 space-y-2">
          {matches.map((match) => (
            <li key={match.id} className="flex items-center justify-between gap-3 text-body">
              <span>
                {match.firstName} {match.lastName} · {match.assignedLeader.fullName}
                {!match.isActive && ' · inactive'}
              </span>
              <Link className="shrink-0 text-accent hover:underline" to={profilePath(match.id)}>
                Review
              </Link>
            </li>
          ))}
        </ul>
        <Button type="button" variant="secondary" className="mt-4" disabled={isSubmitting} onClick={onCreateAnyway}>
          {isSubmitting ? 'Adding…' : 'Create anyway'}
        </Button>
      </Card>
    </div>
  );
}
