const DURATION_PATTERN = /^(\d+)([smhd])$/;

const UNIT_IN_MS = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const;

export function parseDurationToMs(value: string) {
  const match = DURATION_PATTERN.exec(value);

  if (!match) {
    throw new Error(`Invalid duration: ${value}`);
  }

  const amount = Number(match[1]);
  const unit = match[2] as keyof typeof UNIT_IN_MS;

  return amount * UNIT_IN_MS[unit];
}
