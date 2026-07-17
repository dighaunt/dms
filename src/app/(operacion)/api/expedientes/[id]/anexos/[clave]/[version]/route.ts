import { NextResponse } from "next/server";

import { parseId, requerirUsuario, respuesta404, respuestaError } from "@/lib/api";
import { fichaAnexo } from "@/lib/anexos";
import { query } from "@/lib/db";
import { conMarcaAgua } from "@/lib/marca-agua";
import { leerBlob, presignGet } from "@/lib/storage/presign";

// Consulta de un anexo. Los delicados (factura, INE…) se sirven con marca de
// agua «PARA CONSULTA INTERNA · SIN VALIDEZ» aplicada al vuelo; el original
// en el store queda intacto. Los no sensibles redirigen a un GET prefirmado.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; clave: string; version: string }> },
) {
  const { error: authError } = await requerirUsuario();
  if (authError) return authError;

  const { id: idCrudo, clave, version: versionCruda } = await params;
  const id = parseId(idCrudo);
  const version = parseId(versionCruda);
  if (id === null || version === null) return respuesta404("Anexo no encontrado");

  const ficha = fichaAnexo(clave);
  if (!ficha) return respuesta404("Anexo no catalogado");

  try {
    const anexo = await query<{ ruta_objeto: string; content_type: string }>(
      `SELECT ruta_objeto, content_type FROM traza.anexo_expediente
        WHERE expediente_id = $1 AND clave = $2 AND version = $3`,
      [id, clave, version],
    );
    if (anexo.rowCount === 0) return respuesta404("Anexo no encontrado");
    const a = anexo.rows[0];

    if (!ficha.sensible) {
      return NextResponse.redirect(await presignGet(a.ruta_objeto), 302);
    }

    const bytes = await leerBlob(a.ruta_objeto);
    if (!bytes) return respuesta404("El archivo ya no está en el almacén");
    const marcado = await conMarcaAgua(bytes, a.content_type);

    return new NextResponse(Buffer.from(marcado), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${clave}-v${version}-consulta.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return respuestaError(error);
  }
}
