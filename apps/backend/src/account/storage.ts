import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "../config.js";

let client: S3Client | undefined;

function storageConfig() {
  const {
    S3_ENDPOINT: endpoint,
    S3_BUCKET: bucket,
    S3_ACCESS_KEY_ID: accessKeyId,
    S3_SECRET_ACCESS_KEY: secretAccessKey,
  } = config;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("Object storage is not configured.");
  }
  return { endpoint, bucket, accessKeyId, secretAccessKey };
}

/** Reads a private object as a web stream without exposing storage credentials or URLs. */
export async function readAccountMediaObject(storageKey: string): Promise<ReadableStream<Uint8Array>> {
  const settings = storageConfig();
  client ??= new S3Client({
    endpoint: settings.endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
  });
  const result = await client.send(new GetObjectCommand({ Bucket: settings.bucket, Key: storageKey }));
  if (!result.Body) throw new Error("Object storage returned no body.");
  return result.Body.transformToWebStream();
}
