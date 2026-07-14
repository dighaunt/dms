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

const bodySchema = z.object({ referencia: z.string().trim().min(1) });

// Verificación de pago: candado del C-02 → F-11. Solo aplica a C-02.
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
    const doc = await query<{ tipo_codigo: string; expediente_id: number }>(
      `SELECT tipo_codigo, expediente_id FROM traza.documento WHERE id = $1`,
      [id],
    );
    if (doc.rowCount === 0) return respuesta404("Documento no encontrado");
    if (doc.rows[0].tipo_codigo !== "C-02") {
      return NextResponse.json(
        { error: "La verificación de pago solo aplica al contrato C-02" },
        { status: 409 },
      );
    }
    const comprobante = await query<{ existe: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM traza.anexo_expediente
          WHERE expediente_id = $1 AND clave = 'comprobante_pago'
       ) AS existe`,
      [doc.rows[0].expediente_id],
    );
    if (!comprobante.rows[0]?.existe) {
      return NextResponse.json(
        {
          error: "Antes de verificar el pago, sube el comprobante en Anexos del expediente.",
          anexoPendiente: "comprobante_pago",
        },
        { status: 409 },
      );
    }

    await query(
      `INSERT INTO traza.verificacion_pago (documento_id, referencia, verificado_por)
       VALUES ($1, $2, $3)`,
      [id, data.referencia, usuario.id],
    );
    return NextResponse.json({ documentoId: id, pagoVerificado: true }, { status: 201 });
  } catch (error) {
    return respuestaError(error);
  }
}
