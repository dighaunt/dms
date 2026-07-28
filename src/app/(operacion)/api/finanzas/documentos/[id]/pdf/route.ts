import { NextResponse } from "next/server";

import { parseId, requerirUsuario, respuesta404 } from "@/lib/api";
import { responder } from "@/lib/finanzas/api";
import { pdfDeDocumentoFinanciero } from "@/lib/finanzas/pdf/documento-pdf";

/**
 * Impresión del folio con el mismo acomodo que la forma de papel.
 *
 * Se sirve `inline` porque el uso real es abrirlo, revisarlo y mandarlo a la
 * impresora; el navegador sigue pudiendo guardarlo, y lo hará con el folio como
 * nombre. `no-store` evita que una copia de un borrador quede en la caché de un
 * proxy compartido y se siga entregando después de que el folio se firme.
 *
 * Un documento sin firmar sale con su marca de agua: eso lo decide
 * `pdfDeDocumentoFinanciero` a partir del estado, no esta ruta.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Folio no encontrado");

  return responder(
    () => pdfDeDocumentoFinanciero(id),
    (documento) => {
      if (!documento) return respuesta404("Folio no encontrado");

      // El folio ya viene acotado por la base, pero el nombre de archivo entra
      // en una cabecera: se limpia antes de escribirlo para que ni un carácter
      // inesperado pueda partir el encabezado en dos.
      const nombre = documento.folioCompleto.replace(/[^A-Za-z0-9._-]/g, "_");

      return new NextResponse(Buffer.from(documento.pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${nombre}.pdf"`,
          "Cache-Control": "private, no-store",
        },
      });
    },
  );
}
