import { NextResponse } from "next/server";

import { parseId, requerirUsuario, respuesta404 } from "@/lib/api";
import { responder } from "@/lib/finanzas/api";
import { pdfDeDocumentoFinanciero } from "@/lib/finanzas/pdf/documento-pdf";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Folio no encontrado");

  return responder(
    () => pdfDeDocumentoFinanciero(id),
    (documento) => {
      if (!documento) return respuesta404("Folio no encontrado");

      
      
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
