import "server-only";

import { get, issueSignedToken, presignUrl } from "@vercel/blob";
import type { IssuedSignedToken, PresignPutUrlOptions } from "@vercel/blob";

const VENCIMIENTO_MS = 10 * 60 * 1000;

export const CONTENT_TYPES_PERMITIDOS = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type ContentTypePermitido = keyof typeof CONTENT_TYPES_PERMITIDOS;

export async function prepararSubidaCliente(
  pathname: string,
  contentType: string,
  contentLength: number,
): Promise<{
  token: IssuedSignedToken;
  urlOptions: Omit<PresignPutUrlOptions, "operation" | "pathname" | "onUploadCompleted">;
}> {
  const validUntil = Date.now() + VENCIMIENTO_MS;
  const token = await issueSignedToken({
    pathname,
    operations: ["put"],
    validUntil,
  });

  return {
    token,
    urlOptions: {
      allowedContentTypes: [contentType],
      maximumSizeInBytes: contentLength,
      validUntil,

      addRandomSuffix: false,
    },
  };
}

export async function presignGet(pathname: string): Promise<string> {
  const validUntil = Date.now() + VENCIMIENTO_MS;
  const firmado = await issueSignedToken({
    pathname,
    operations: ["get"],
    validUntil,
  });
  const { presignedUrl } = await presignUrl(firmado, {
    operation: "get",
    pathname,
    access: "private",
    validUntil,
  });
  return presignedUrl;
}

export async function leerBlob(pathname: string): Promise<Uint8Array | null> {
  const resultado = await get(pathname, { access: "private" });
  if (!resultado) return null;
  const buffer = await new Response(resultado.stream).arrayBuffer();
  return new Uint8Array(buffer);
}
