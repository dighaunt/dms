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
  sha256: z.string().regex(/^[0-9a-f]{64}$/, "sha256 hex en minúsculas"),
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
      id: number;
      folio: string;
      numero_expediente: string;
      cancelado: boolean;
      siguiente_version: number;
    }>(
      `SELECT vd.id, vd.folio, vd.numero_expediente, vd.cancelado,
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

    // La misma evidencia no debe subir de nuevo ni crear un blob huérfano.
    // Reintentar el mismo archivo para este folio es idempotente; usarlo para
    // otro folio se rechaza con una explicación de trazabilidad.
    const existente = await query<{
      documento_id: number;
      version: number;
      folio: string;
    }>(
      `SELECT a.documento_id, a.version, vd.folio
         FROM traza.archivo_escaneado a
         JOIN traza.v_documento vd ON vd.id = a.documento_id
        WHERE a.sha256 = $1`,
      [data.sha256],
    );
    if ((existente.rowCount ?? 0) > 0) {
      const archivo = existente.rows[0];
      if (archivo.documento_id === d.id) {
        return NextResponse.json({
          yaRegistrado: true,
          version: archivo.version,
          rutaObjeto: null,
        });
      }
      return NextResponse.json(
        {
          error: `Este archivo ya está resguardado en ${archivo.folio}. Cada folio debe conservar su propio documento firmado.`,
        },
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
