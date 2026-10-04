/** Gives this one command access to the bucket credentials kept separate from local development. */
export function activateMediaSyncBucket(environment: NodeJS.ProcessEnv): void {
  for (const suffix of ["ENDPOINT", "BUCKET", "ACCESS_KEY_ID", "SECRET_ACCESS_KEY"] as const) {
    const key = `S3_${suffix}`;
    const dedicated = environment[`ZEROPS_${key}`];
    const active = environment[key];
    if (active && dedicated && active !== dedicated) {
      throw new Error(`Conflicting ${key} and ZEROPS_${key} settings.`);
    }
    if (!active && dedicated) environment[key] = dedicated;
  }
}

/** Bucket maintenance reads the local library and must never substitute a hosted database. */
export function requireLocalMediaDatabase(raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Bucket maintenance requires a valid local development database URL.");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  ) {
    throw new Error("Bucket maintenance requires the local development database.");
  }
}
