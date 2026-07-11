import { S3Client, GetObjectCommand, HeadObjectCommand, type PutObjectCommandInput } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { buildObjectKey, createSecurityHeaders } from "@omnivox/security";
import type { PresignRequest, PresignResponse } from "@omnivox/shared";
import { getEnv } from "./env";

function getS3Client() {
  const env = getEnv();
  return new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY
    }
  });
}

export async function createPresignedUpload(request: PresignRequest): Promise<PresignResponse> {
  const env = getEnv();
  const key = buildObjectKey({ tenantId: request.tenantId, meetingId: request.meetingId, extension: request.audioFormat });
  const input: PutObjectCommandInput = {
    Bucket: env.S3_BUCKET,
    Key: key,
    ContentType: request.contentType,
    ContentLength: request.contentLength
  };
  const requiredHeaders: Record<string, string> = createSecurityHeaders({
    serverSideEncryption: env.S3_SERVER_SIDE_ENCRYPTION
  });
  if (env.S3_CHECKSUM_ENABLED) {
    const checksumSha256 = Buffer.from(request.sha256, "hex").toString("base64");
    input.ChecksumSHA256 = checksumSha256;
    requiredHeaders["x-amz-checksum-sha256"] = checksumSha256;
  }
  if (env.S3_SERVER_SIDE_ENCRYPTION) {
    input.ServerSideEncryption = env.S3_SERVER_SIDE_ENCRYPTION as PutObjectCommandInput["ServerSideEncryption"];
  }
  const command = new PutObjectCommand(input);
  const uploadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: env.S3_PRESIGN_TTL_SECONDS
  });

  return {
    uploadUrl,
    objectKey: key,
    requiredHeaders,
    expiresAt: new Date(Date.now() + env.S3_PRESIGN_TTL_SECONDS * 1000).toISOString()
  };
}

export async function verifyUploadedObject(objectKey: string) {
  const env = getEnv();
  await getS3Client().send(
    new HeadObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: objectKey
    })
  );
}

export async function createPresignedReadUrl(objectKey: string) {
  const env = getEnv();
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: objectKey
  });
  return getSignedUrl(getS3Client(), command, { expiresIn: 300 });
}
