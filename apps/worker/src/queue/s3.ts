import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getWorkerEnv } from "@/lib/env";

let s3Client: S3Client | null = null;

function getS3Client() {
  if (s3Client) {
    return s3Client;
  }
  const env = getWorkerEnv();
  s3Client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
  return s3Client;
}

export async function createPresignedReadUrl(objectKey: string) {
  const env = getWorkerEnv();
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: objectKey,
  });
  return getSignedUrl(getS3Client(), command, { expiresIn: 300 });
}
