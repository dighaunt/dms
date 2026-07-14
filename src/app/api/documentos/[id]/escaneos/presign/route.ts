import { NextResponse } from "next/server";
import { z } from "zod";

import {
  leerBody,
  parseId,
  requerirDocumentoEditable,
  requerirUsuario,
  respuesta404,
  respuestaError,
} from "@/lib/api";
import { query } from "@/lib/db";
import {
  CONTENT_TYPES_PERMITIDOS,
  presignPut,
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

  const { data, error: bodyError } = await leerBody(request, bodySchema);
  if (bodyError) return bodyError;

  try {
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
      [id],
    );
    if (doc.rowCount === 0) return respuesta404("Documento no encontrado");
    const d = doc.rows[0];
    if (d.cancelado) {
      return NextResponse.json(
        { error: "Documento CANCELADO: se conserva pero no admite nuevos escaneos" },
        { status: 409 },
      );
    }

    // Reintentar el mismo archivo para este folio es idempotente y no crea
    // otro blob. La unicidad es por documento, no global: un mismo soporte
    // puede corresponder legítimamente a más de un acto documental.
    const existente = await query<{
      id: number;
    }>(
      `SELECT id FROM traza.documento_adjunto WHERE documento_id = $1 AND sha256 = $2`,
      [id, data.sha256],
    );
    if ((existente.rowCount ?? 0) > 0) {
      return NextResponse.json({ yaRegistrado: true, archivoId: existente.rows[0].id, rutaObjeto: null });
    }

    const extension = CONTENT_TYPES_PERMITIDOS[data.contentType];
    const rutaObjeto = `expedientes/${d.numero_expediente}/${d.folio}/archivo-${d.siguiente_archivo}.${extension}`;
    const url = await presignPut(rutaObjeto, data.contentType, data.tamanoBytes);

    return NextResponse.json({
      url,
      rutaObjeto,
      archivoId: null,
      venceEnSegundos: 600,
    });
  } catch (error) {
    return respuestaError(error);
  }
}
