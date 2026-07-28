import { NextResponse } from "next/server";

import { parseId, respuesta404 } from "@/lib/api";
import { cuerpo, requerirNivelMinimo, responder } from "@/lib/finanzas/api";
import { atenderAlerta } from "@/lib/finanzas/egresos";

/**
 * Da por atendida una alerta abierta.
 *
 * Atender NO es borrar. La alerta es un hecho —hubo un faltante, hubo un
 * retiro de socio sin reparto que lo respaldara— y sigue habiendo ocurrido
 * después de revisarla; lo que cambia es que alguien se hizo cargo y dejó
 * dicho qué encontró. Por eso el servicio escribe `atendida_por`,
 * `atendida_en` y `nota_atencion` en lugar de tocar la fila original, y por
 * eso su WHERE exige que siga abierta: atender dos veces borraría el nombre y
 * la nota de quien lo hizo primero.
 *
 * Quién puede hacerlo: de N2 para arriba. Un faltante de caja escala al
 * Gerente General y su descargo es la rendición de cuentas de quien tenía el
 * dinero a su cargo; dejar que el mismo nivel que opera la caja cierre la
 * alerta que la caja levantó convertiría el control en una formalidad.
 */
const MENSAJE_AUTORIZACION =
  "Atender una alerta de Finanzas es un acto de supervisión sobre quien tenía el dinero a su cargo: requiere nivel N2 o N3";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await requerirNivelMinimo("N2", MENSAJE_AUTORIZACION);
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Alerta no encontrada");

  // La nota se pasa sin remodelar: el largo mínimo lo impone el zod del
  // servicio, y si no viene sale como 400 señalando el campo.
  const { nota } = (await cuerpo(request)) as { nota: string };

  return responder(
    () => atenderAlerta(id, usuario.id, nota),
    (resultado) =>
      resultado === null
        ? respuesta404("Alerta no encontrada")
        : NextResponse.json(resultado),
  );
}
