import { NextResponse } from "next/server";

import {
  formatearFolio,
  parseId,
  requerirUsuario,
  respuesta404,
  respuestaError,
} from "@/lib/api";
import { valoresParaPdf } from "@/lib/formularios/captura";
import { renderizarFormularioPdf } from "@/lib/formatos-pdf";

// Solo genera un PDF final cuando el wizard resolvió todos los campos. El
// snapshot tipado de la captura es la fuente; no quedan huecos silenciosos.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error: authError } = await requerirUsuario();
  if (authError) return authError;
  const id = parseId((await params).id);
  if (id === null) return respuesta404("Documento no encontrado");

  try {
    const resolved = await valoresParaPdf(id);
    if (!resolved) return respuesta404("Documento no encontrado");
    const { contexto, template, values } = resolved;
    const folio = formatearFolio(contexto.tipo, contexto.anio, contexto.consecutivo);
    const pdf = await renderizarFormularioPdf({
      tipo: contexto.tipo,
      titulo: `${folio} · ${contexto.numeroExpediente}`,
      template,
      values,
    });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${folio}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/wizard|campos sin resolver|no tiene un valor|validación final/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return respuestaError(error);
  }
}
