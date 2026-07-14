import { NextResponse } from "next/server";
import { z } from "zod";

import {
  leerBody,
  parseId,
  requerirExpedienteEditable,
  requerirUsuario,
  respuesta404,
  respuestaError,
} from "@/lib/api";
import { fichaAnexo } from "@/lib/anexos";
import { query } from "@/lib/db";
import { CONTENT_TYPES_PERMITIDOS, presignPut } from "@/lib/storage/presign";

const MAX_BYTES = 25 * 1024 * 1024;

// La marca de agua envuelve imágenes en PDF con pdf-lib, que no soporta webp;
// los anexos aceptan solo estos tipos.
const TIPOS_ANEXO = ["application/pdf", "image/jpeg", "image/png"] as const;

const bodySchema = z.object({
  clave: z.string().trim().min(1),
  tamanoBytes: z.number().int().min(1).max(MAX_BYTES),
  contentType: z.enum(TIPOS_ANEXO, { error: "Solo PDF o imagen (jpeg/png)" }),
});

// PUT prefirmado al store privado con ruta anexos/{expediente}/{clave}/v{n}.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { usuario, error: authError } = await requerirUsuario();
  if (authError) return authError;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Expediente no encontrado");
  const cierreError = await requerirExpedienteEditable(id, usuario);
  if (cierreError) return cierreError;

  const { data, error: bodyError } = await leerBody(request, bodySchema);
  if (bodyError) return bodyError;

  const ficha = fichaAnexo(data.clave);
  if (!ficha) return respuesta404("Anexo no catalogado");

  try {
    const exp = await query<{
      numero_expediente: string;
      origen: "PROPIA" | "CONSIGNADA";
      siguiente_version: number;
    }>(
      `SELECT e.anio::text || '-' || lpad(e.consecutivo::text, 3, '0') AS numero_expediente,
              e.origen,
              COALESCE((SELECT max(a.version) FROM traza.anexo_expediente a
                         WHERE a.expediente_id = e.id AND a.clave = $2), 0) + 1 AS siguiente_version
         FROM traza.expediente e
        WHERE e.id = $1`,
      [id, data.clave],
    );
    if (exp.rowCount === 0) return respuesta404("Expediente no encontrado");
    const e = exp.rows[0];
    if (ficha.exigencia[e.origen] === null) {
      return NextResponse.json(
        { error: `El anexo «${ficha.nombre}» no aplica a una unidad ${e.origen.toLowerCase()}` },
        { status: 409 },
      );
    }

    const extension = CONTENT_TYPES_PERMITIDOS[data.contentType];
    const rutaObjeto = `anexos/${e.numero_expediente}/${data.clave}/v${e.siguiente_version}.${extension}`;
    const url = await presignPut(rutaObjeto, data.contentType, data.tamanoBytes);

    return NextResponse.json({
      url,
      rutaObjeto,
      version: e.siguiente_version,
      venceEnSegundos: 600,
    });
  } catch (error) {
    return respuestaError(error);
  }
}
