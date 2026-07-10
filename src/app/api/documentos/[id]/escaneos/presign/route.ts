import { NextResponse } from "next/server";
import { z } from "zod";

import {
  leerBody,
  parseId,
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
  contentType: z.enum(
    Object.keys(CONTENT_TYPES_PERMITIDOS) as [ContentTypePermitido, ...ContentTypePermitido[]],
    { error: "Solo PDF o imagen (jpeg/png/webp)" },
  ),
});

// Genera un PUT prefirmado a R2 con key expedientes/{numero}/{folio}/v{n}.{ext}.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error: authError } = await requerirUsuario();
  if (authError) return authError;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Documento no encontrado");

  const { data, error: bodyError } = await leerBody(request, bodySchema);
  if (bodyError) return bodyError;

  try {
    const doc = await query<{
      folio: string;
      numero_expediente: string;
      cancelado: boolean;
      siguiente_version: number;
    }>(
      `SELECT vd.folio, vd.numero_expediente, vd.cancelado,
              COALESCE((SELECT max(a.version) FROM traza.archivo_escaneado a
                         WHERE a.documento_id = vd.id), 0) + 1 AS siguiente_version
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

    const extension = CONTENT_TYPES_PERMITIDOS[data.contentType];
    const rutaObjeto = `expedientes/${d.numero_expediente}/${d.folio}/v${d.siguiente_version}.${extension}`;
    const url = await presignPut(rutaObjeto, data.contentType, data.tamanoBytes);

    return NextResponse.json({
      url,
      rutaObjeto,
      version: d.siguiente_version,
      venceEnSegundos: 600,
    });
  } catch (error) {
    return respuestaError(error);
  }
}
