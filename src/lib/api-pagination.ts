export function parsePaginationParam(
  value: string | null | undefined,
  defaultValue: number,
  min: number,
  max: number
) {
  if (value == null || value.trim() === "") return defaultValue;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultValue;

  const whole = Math.trunc(parsed);
  return Math.min(Math.max(whole, min), max);
}
