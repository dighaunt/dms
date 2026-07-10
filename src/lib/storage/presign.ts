import "server-only";

import { get, issueSignedToken, presignUrl } from "@vercel/blob";

// Store PRIVADO de Vercel Blob: el SDK se autentica con VERCEL_OIDC_TOKEN +
// BLOB_STORE_ID (en local se refrescan con `vercel env pull`). Toda
// lectura/escritura del navegador pasa por URLs prefirmadas de vida corta.
const VENCIMIENTO_MS = 10 * 60 * 1000;

export const CONTENT_TYPES_PERMITIDOS = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type ContentTypePermitido = keyof typeof CONTENT_TYPES_PERMITIDOS;

export async function presignPut(
  pathname: string,
  contentType: string,
  contentLength: number,
): Promise<string> {
  const validUntil = Date.now() + VENCIMIENTO_MS;
  const firmado = await issueSignedToken({
    pathname,
    operations: ["put"],
    allowedContentTypes: [contentType],
    maximumSizeInBytes: contentLength,
    validUntil,
  });
  const { presignedUrl } = await presignUrl(firmado, {
    operation: "put",
    pathname,
    access: "private",
    allowedContentTypes: [contentType],
    maximumSizeInBytes: contentLength,
    validUntil,
    // La ruta exacta ES el contrato con la BD (ruta_objeto único y versionado);
    // sin esto el store agrega un sufijo aleatorio y el registro no coincide.
    addRandomSuffix: false,
  });
  return presignedUrl;
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

/** Lee un blob privado completo en memoria (para marcar agua al vuelo). */
export async function leerBlob(pathname: string): Promise<Uint8Array | null> {
  const resultado = await get(pathname, { access: "private" });
  if (!resultado) return null;
  const buffer = await new Response(resultado.stream).arrayBuffer();
  return new Uint8Array(buffer);
}
