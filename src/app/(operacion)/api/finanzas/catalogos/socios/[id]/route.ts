import { NextResponse } from "next/server";

import { parseId, respuesta404 } from "@/lib/api";
import { cuerpo, requerirNivelMinimo, responder } from "@/lib/finanzas/api";
import { type EntradaDarDeBajaSocio, darDeBajaSocio } from "@/lib/finanzas/personas";

const MENSAJE_N3 =
  "Solo un administrador global (N3) puede dar de baja a un socio: la salida de un accionista se acredita con el documento que la asienta";

/**
 * Da de baja a un socio. El id de la ruta es el de su PERSONA, que es la llave
 * del registro.
 *
 * La baja no borra nada: sus retiros siguen ahí y su saldo por comprobar sigue
 * contando, que es justo lo que un socio que se va deja pendiente. Lo que
 * cambia es que `exigir_socio_vigente` deja de admitir retiros de utilidades a
 * su nombre, y ése es el candado que faltaba: la caja podía entregarle dinero
 * a nombre de una utilidad a la que ya no tiene derecho.
 *
 * No hay reactivación por esta vía. Un socio que reingresa se registra otra vez
 * (POST del catálogo) con el acta nueva que lo sustenta: volver a ponerlo
 * vigente sin documento sería exactamente lo que este registro existe para
 * evitar.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requerirNivelMinimo("N3", MENSAJE_N3);
  if (error) return error;

  const personaId = parseId((await params).id);
  if (personaId === null) return respuesta404("Esa persona no está registrada como socio");

  const datos = (await cuerpo(request)) as EntradaDarDeBajaSocio;

  return responder(
    () => darDeBajaSocio(personaId, datos),
    (socio) =>
      socio
        ? NextResponse.json(socio)
        : respuesta404("Esa persona no está registrada como socio"),
  );
}
