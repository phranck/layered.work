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
