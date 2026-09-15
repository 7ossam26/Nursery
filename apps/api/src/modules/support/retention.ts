export type BackupKind = 'SCHEDULED' | 'MANUAL' | 'PRE_UPGRADE' | 'PRE_RESTORE';
export type RetentionPolicy = Readonly<{ daily: number; weekly: number; manual: number }>;
export type RecoverySet<T = unknown> = Readonly<{ kind: BackupKind; createdAt: Date; ref: T }>;

// ISO-8601 week key (Monday-based), UTC. A weekly slot keeps the newest set inside that week.
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return `${d.getUTCFullYear()}-W${String(Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7)).padStart(2, '0')}`;
}
// D23: scheduled sets keep the newest `daily` plus the newest set of each of the next `weekly` older ISO weeks;
// manual and pre-upgrade/pre-restore sets keep the newest `manual` per kind. Everything else is returned for deletion.
export function selectExpired<T>(sets: readonly RecoverySet<T>[], policy: RetentionPolicy): RecoverySet<T>[] {
  const byKind = new Map<BackupKind, RecoverySet<T>[]>();
  for (const set of sets) byKind.set(set.kind, [...(byKind.get(set.kind) ?? []), set]);
  const expired: RecoverySet<T>[] = [];
  for (const [kind, group] of byKind) {
    const sorted = [...group].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (kind !== 'SCHEDULED') { expired.push(...sorted.slice(policy.manual)); continue; }
    const rest = sorted.slice(policy.daily); const weeks = new Set<string>();
    for (const set of rest) {
      const week = isoWeekKey(set.createdAt);
      if (!weeks.has(week) && weeks.size < policy.weekly) { weeks.add(week); continue; }
      expired.push(set);
    }
  }
  return expired;
}
