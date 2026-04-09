import { Response } from 'express';

interface Pagination {
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export function sendSuccess<T>(res: Response, data: T, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data });
}

export function sendPaginated<T>(res: Response, data: T[], pagination: Pagination) {
  return res.status(200).json({ success: true, data, pagination });
}

export function sendError(res: Response, statusCode: number, code: string, message: string) {
  return res.status(statusCode).json({ success: false, error: { code, message } });
}

export function parsePagination(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(query.per_page) || 25));
  const skip = (page - 1) * perPage;
  return { page, perPage, skip };
}
