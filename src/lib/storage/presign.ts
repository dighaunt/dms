import "server-only";

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { r2, r2BucketName } from "@/lib/storage";

// Bucket privado: toda lectura/escritura pasa por URLs prefirmadas (10 min).
const VENCIMIENTO_SEGUNDOS = 600;

export const CONTENT_TYPES_PERMITIDOS = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type ContentTypePermitido = keyof typeof CONTENT_TYPES_PERMITIDOS;

export function presignPut(key: string, contentType: string, contentLength: number) {
  return getSignedUrl(
    r2,
    new PutObjectCommand({
      Bucket: r2BucketName,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    }),
    { expiresIn: VENCIMIENTO_SEGUNDOS },
  );
}

export function presignGet(key: string) {
  return getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: r2BucketName, Key: key }),
    { expiresIn: VENCIMIENTO_SEGUNDOS },
  );
}
