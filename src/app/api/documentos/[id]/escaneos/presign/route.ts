import { NextResponse } from "next/server";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { z } from "zod";

import {
  parseId,
  requerirDocumentoEditable,
  requerirUsuario,
  respuesta404,
  respuestaError,
} from "@/lib/api";
import { query } from "@/lib/db";
import {
  CONTENT_TYPES_PERMITIDOS,
  prepararSubidaCliente,
  type ContentTypePermitido,
} from "@/lib/storage/presign";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB por escaneo

const bodySchema = z.object({
  nombreArchivo: z.string().trim().min(1),
  tamanoBytes: z.number().int().min(1).max(MAX_BYTES),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, "sha256 hex en minúsculas"),
  contentType: z.enum(
    Object.keys(CONTENT_TYPES_PERMITIDOS) as [ContentTypePermitido, ...ContentTypePermitido[]],
    { error: "Solo PDF o imagen (jpeg/png/webp)" },
  ),
});

const eventoSubidaSchema = z.object({
  type: z.literal("blob.generate-presigned-url"),
  payload: z.object({
    pathname: z.string().min(1),
    clientPayload: z.string().nullable(),
    multipart: z.boolean(),
  }),
});

async function prepararEscaneo(documentoId: number, datos: z.infer<typeof bodySchema>) {
  const doc = await query<{
    id: number;
    folio: string;
    numero_expediente: string;
    cancelado: boolean;
    siguiente_archivo: number;
  }>(
    `SELECT vd.id, vd.folio, vd.numero_expediente, vd.cancelado,
            (SELECT count(*) FROM traza.documento_adjunto a
                       WHERE a.documento_id = vd.id) + 1 AS siguiente_archivo
       FROM traza.v_documento vd
      WHERE vd.id = $1`,
    [documentoId],
  );
  if (doc.rowCount === 0) throw new Error("Documento no encontrado");
  const d = doc.rows[0];
  if (d.cancelado) throw new Error("Documento CANCELADO: se conserva pero no admite nuevos escaneos");

  // Reintentar el mismo archivo para este folio es idempotente y no crea
  // otro blob. La unicidad es por documento, no global: un mismo soporte
  // puede corresponder legítimamente a más de un acto documental.
  const existente = await query<{ id: number }>(
    `SELECT id FROM traza.documento_adjunto WHERE documento_id = $1 AND sha256 = $2`,
    [documentoId, datos.sha256],
  );
  if ((existente.rowCount ?? 0) > 0) {
    return { yaRegistrado: true as const, archivoId: existente.rows[0].id, rutaObjeto: null };
  }

  const extension = CONTENT_TYPES_PERMITIDOS[datos.contentType];
  return {
    yaRegistrado: false as const,
    archivoId: null,
    rutaObjeto: `expedientes/${d.numero_expediente}/${d.folio}/archivo-${d.siguiente_archivo}.${extension}`,
  };
}

// Genera un PUT prefirmado para un adjunto real dentro de la colección del folio.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { usuario, error: authError } = await requerirUsuario();
  if (authError) return authError;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Documento no encontrado");
  const cierreError = await requerirDocumentoEditable(id, usuario);
  if (cierreError) return cierreError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "La solicitud de carga no tiene un formato válido." },
      { status: 400 },
    );
  }

  const evento = eventoSubidaSchema.safeParse(body);

  try {
    if (evento.success) {
      if (evento.data.payload.multipart) {
        return NextResponse.json({ error: "Los escaneos no usan carga multipart" }, { status: 400 });
      }
      const datos = bodySchema.parse(JSON.parse(evento.data.payload.clientPayload ?? "null"));
      const preparado = await prepararEscaneo(id, datos);
      if (preparado.yaRegistrado || preparado.rutaObjeto !== evento.data.payload.pathname) {
        return NextResponse.json({ error: "La ruta de carga no corresponde al escaneo solicitado" }, { status: 409 });
      }

      const respuesta = await handleUploadPresigned({
        body: evento.data as HandleUploadPresignedBody,
        request,
        getSignedToken: async () => ({
          ...(await prepararSubidaCliente(preparado.rutaObjeto, datos.contentType, datos.tamanoBytes)),
        }),
      });
      return NextResponse.json(respuesta);
    }

    const datos = bodySchema.parse(body);
    const preparado = await prepararEscaneo(id, datos);
    if (preparado.yaRegistrado) return NextResponse.json(preparado);

    return NextResponse.json({
      ...preparado,
      contentType: datos.contentType,
    });
  } catch (error) {
    return respuestaError(error);
  }
}
