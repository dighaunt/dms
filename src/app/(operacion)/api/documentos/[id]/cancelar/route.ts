import { NextResponse } from "next/server";
import { z } from "zod";

import {
  TIPOS_DOCUMENTO,
  formatearFolio,
  leerBody,
  parseId,
  requerirDocumentoEditable,
  requerirUsuario,
  respuesta404,
  respuestaError,
} from "@/lib/api";
import { withTransaction } from "@/lib/db";

const bodySchema = z.object({
  motivo: z.string().trim().min(1),
  sustituirConTipo: z.enum(TIPOS_DOCUMENTO).optional(),
});

// CANCELADO se conserva. Corrección = cancelación + sustitución con folio
// nuevo del MISMO tipo; nunca edición del original.
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
    const resultado = await withTransaction(async (client) => {
      const doc = await client.query<{
        tipo_codigo: string;
        expediente_id: string;
        cancelado: boolean;
      }>(
        `SELECT d.tipo_codigo, d.expediente_id,
                EXISTS (SELECT 1 FROM traza.documento_cancelacion c
                         WHERE c.documento_id = d.id) AS cancelado
           FROM traza.documento d WHERE d.id = $1`,
        [id],
      );
      if (doc.rowCount === 0) return { estado: 404 as const };
      const d = doc.rows[0];
      if (d.cancelado) {
        return {
          estado: 409 as const,
          error: "El documento ya está cancelado (no puede cancelarse dos veces)",
        };
      }
      if (data.sustituirConTipo && data.sustituirConTipo !== d.tipo_codigo) {
        return {
          estado: 400 as const,
          error: `El sustituto debe ser del mismo tipo (${d.tipo_codigo})`,
        };
      }

      await client.query(
        `INSERT INTO traza.documento_cancelacion (documento_id, motivo, cancelado_por)
         VALUES ($1, $2, $3)`,
        [id, data.motivo, usuario.id],
      );

      let sustituto = null;
      if (data.sustituirConTipo) {
        const nuevo = await client.query<{
          id: string;
          tipo_codigo: string;
          revision: string;
          anio: number;
          consecutivo: number;
        }>(`SELECT * FROM traza.emitir_folio($1, $2, $3)`, [
          d.tipo_codigo,
          d.expediente_id,
          usuario.id,
        ]);
        const n = nuevo.rows[0];
        await client.query(
          `INSERT INTO traza.documento_sustitucion (cancelado_id, sustituto_id)
           VALUES ($1, $2)`,
          [id, n.id],
        );
        sustituto = {
          documentoId: Number(n.id),
          tipo: n.tipo_codigo,
          revision: n.revision,
          folio: formatearFolio(n.tipo_codigo, n.anio, n.consecutivo),
        };
      }

      return { estado: 200 as const, sustituto };
    });

    if (resultado.estado === 404) return respuesta404("Documento no encontrado");
    if (resultado.estado !== 200) {
      return NextResponse.json({ error: resultado.error }, { status: resultado.estado });
    }
    return NextResponse.json({ documentoId: id, cancelado: true, sustituto: resultado.sustituto });
  } catch (error) {
    return respuestaError(error);
  }
}
