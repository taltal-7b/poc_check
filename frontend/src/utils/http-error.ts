export function httpStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

export function isNotFoundError(error: unknown): boolean {
  return httpStatus(error) === 404;
}
