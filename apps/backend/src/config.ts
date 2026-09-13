import { z } from "zod";

/**
 * Everything this service reads from its environment, checked once before the
 * port opens.
 *
 * **A missing secret stops the boot.** The alternative is a service that starts,
 * looks healthy, and fails the first request that needs the value, which is
 * hours later and somewhere else. Checking at start-up turns that into a
 * container that will not start and a log line naming the variable.
 *
 * **Development convenience is a condition on the environment, never on whether
 * the value happens to be there.** A guard written as "if the secret is set"
 * passes in production the moment somebody forgets to set it, which is the one
 * time it had to refuse.
 */

/**
 * How long a session secret has to be.
 *
 * It signs the session cookie, so its strength is its length. 32 characters of
 * a random alphabet is comfortably past what anything will search, and shorter
 * than that is usually somebody's password typed in rather than a generated
 * value, which is the case this number is really catching.
 */
const SESSION_SECRET_MIN = 32;

/** The body this API accepts, in bytes. A request larger than this is refused unread. */
export const MAX_BODY_BYTES = 1_000_000;

/**
 * A value that may be absent, where an empty string counts as absent.
 *
 * An `.env` file has no way to say "not set" other than an empty value, and
 * `.env.example` ships every secret that way on purpose. Without this, a
 * checkout with the template copied verbatim has `SESSION_SECRET` set to the
 * empty string, which is present, fails a length check, and reads as a
 * misconfiguration rather than as the blank it is.
 *
 * @param inner - What the value has to look like when it is there.
 */
function optional<Schema extends z.ZodType>(inner: Schema) {
  return z.preprocess((value) => (value === "" ? undefined : value), inner.optional());
}

/** What has to be true of the environment for the service to run at all. */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /**
   * Zerops holds the `PORT` key itself and refuses `zerops.yml` when it
   * appears under `envVariables`, so in production this arrives from the
   * platform and matches the port declared under `ports`. Locally `grat`
   * sets it.
   */
  PORT: z.coerce.number().int().positive().default(3000),

  /**
   * Dual stack by default. Zerops service discovery can return an IPv6
   * upstream, and binding to IPv4 alone has produced intermittent gateway
   * errors in the sibling projects.
   */
  HOST: z.string().min(1).default("::"),

  /** `silent` is pino's own level for emitting nothing, which the suite uses. */
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).default("info"),

  DATABASE_URL: z.string().min(1),
  DATABASE_EXPECTED_ROLE: optional(z.string().min(1)),

  /** The two origins that may call this API with a cookie. Nothing else may. */
  SITE_ORIGIN: z.url(),
  DASHBOARD_ORIGIN: z.url(),

  SESSION_SECRET: optional(z.string().min(SESSION_SECRET_MIN)),

  S3_ENDPOINT: optional(z.string()),
  S3_BUCKET: optional(z.string()),
  S3_ACCESS_KEY_ID: optional(z.string()),
  S3_SECRET_ACCESS_KEY: optional(z.string()),

  SMTP2GO_API_KEY: optional(z.string()),
  EMAIL_FROM: optional(z.string()),
});

/** What the environment turned out to say. */
export type Config = z.infer<typeof schema>;

/**
 * Reads the environment, or explains what is missing.
 *
 * Separate from the value below so a test can hand it an environment without
 * touching the real one, and so the message can be checked.
 *
 * @param environment - Usually `process.env`.
 * @returns The validated configuration.
 * @throws When something required is absent or malformed, naming every variable
 *   at fault and never printing a value.
 */
export function readConfig(environment: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(environment);
  const faults = parsed.success
    ? []
    : parsed.error.issues.map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`);

  faults.push(...productionOnly(environment));
  if (faults.length === 0 && parsed.success) return parsed.data;

  throw new Error(`The environment is not usable:\n${faults.join("\n")}`);
}

/**
 * What production needs and development does not.
 *
 * Checked here against the raw environment rather than inside the schema,
 * because a schema-level refinement runs only once the object itself parsed.
 * A container missing its database address and its session secret would then
 * be told about the first, fixed, redeployed, and told about the second, which
 * is two deployments to learn one thing.
 *
 * @param environment - The raw variables, not the parsed ones, since there may
 *   not be any parsed ones.
 */
function productionOnly(environment: NodeJS.ProcessEnv): string[] {
  if (environment.NODE_ENV !== "production") return [];

  // Only absence. A secret that is present and too short is already refused by
  // the schema, and saying so twice reads as two problems.
  if (environment.SESSION_SECRET) return [];

  return [`  SESSION_SECRET: required in production, at least ${SESSION_SECRET_MIN} characters`];
}

/**
 * The configuration this process runs on.
 *
 * Read at import time on purpose, so that a service which cannot be configured
 * fails whilst it is starting rather than whilst it is serving.
 */
export const config = readConfig();

/**
 * Where this is running.
 *
 * Asked wherever the answer is genuinely about the environment, such as whether
 * logs are readable or machine-shaped. It is never the way a security check
 * decides whether to apply: those are written so that the strict path is the
 * one taken when nothing says otherwise.
 */
export const isProduction = config.NODE_ENV === "production";
