import { AppError } from './errors';

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

export interface Pagination {
  page: number;
  pageSize: number;
  skip: number;
}

function positiveInteger(value: unknown, fallback: number, field: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new AppError(400, `${field} must be a positive integer`);
  }
  return parsed;
}

export function paginationFromQuery(query: Record<string, unknown>): Pagination | null {
  if (query.page === undefined && query.pageSize === undefined) return null;
  const page = positiveInteger(query.page, 1, 'page');
  const pageSize = positiveInteger(query.pageSize, DEFAULT_PAGE_SIZE, 'pageSize');
  if (pageSize > MAX_PAGE_SIZE) {
    throw new AppError(400, `pageSize cannot exceed ${MAX_PAGE_SIZE}`);
  }
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function listMetadata(total: number, count: number, pagination: Pagination | null) {
  const page = pagination?.page ?? 1;
  const pageSize = pagination?.pageSize ?? count;
  return {
    total,
    count,
    page,
    pageSize,
    pageCount: pagination ? Math.max(1, Math.ceil(total / pagination.pageSize)) : 1,
  };
}
