export function isInterpolationEnabled(
  raw: Record<string, unknown> | undefined,
  resolved: Record<string, unknown> | undefined
): boolean {
  return raw?.interpolate === true || resolved?.interpolate === true;
}

export function pickInterpolatedString(opts: {
  interpolate: boolean;
  rawValue: unknown;
  resolvedValue: unknown;
  step: string;
  field: string;
}): string {
  const selected = opts.interpolate ? opts.resolvedValue : opts.rawValue;
  if (typeof selected !== "string") {
    throw new Error(`${opts.step} step requires '${opts.field}' string`);
  }
  return selected;
}
