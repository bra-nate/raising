import { Button } from './ui';

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav className="flex items-center justify-between border-t border-hairline px-5 py-3" aria-label="Pagination">
      <span className="text-caption text-faint">
        {first}–{last} of {total}
      </span>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          Previous
        </Button>
        <Button variant="ghost" onClick={() => onPageChange(page + 1)} disabled={page >= pageCount}>
          Next
        </Button>
      </div>
    </nav>
  );
}
