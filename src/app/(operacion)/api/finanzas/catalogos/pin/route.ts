import { NextResponse } from "next/server";

import { requerirUsuario } from "@/lib/api";
import { cuerpo, responder } from "@/lib/finanzas/api";
import { establecerPin, tienePinDeFirma } from "@/lib/finanzas/catalogos";

/**
 * PIN de firma del usuario de la sesión.
 *
 * Aquí NO se pide N3 a propósito, a diferencia de las otras rutas de catálogo:
 * el PIN es la rúbrica personal de quien firma, así que cada quien establece el
 * suyo. Y sólo el suyo: el id sale de `requerirUsuario()`, nunca del cuerpo, de
 * modo que no existe forma de dirigir esta ruta al PIN de otra persona.
 *
 * El valor en claro no se guarda ni se registra en ningún lado. Lo único que
 * llega a la base es su hash bcrypt, calculado dentro de `establecer_pin_firma`;
 * el PIN viaja como parámetro enlazado y esta ruta no lo escribe en ningún log
 * ni lo devuelve en la respuesta. Por eso viaja en el cuerpo de un POST y no en
 * la barra de direcciones: la URL queda en el historial del navegador y en la
 * bitácora de accesos del servidor.
 */

/** Si el usuario ya puede firmar. Nunca devuelve el PIN ni su hash. */
export async function GET() {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  return responder(async () => ({ tienePin: await tienePinDeFirma(usuario.id) }));
}

/** Establece el PIN por primera vez o lo cambia. Ambas cosas son la misma. */
export async function POST(request: Request) {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  const datos = (await cuerpo(request)) as Record<string, unknown>;
  const pin = datos.pin;

  // Se comprueba que sea texto antes de dárselo a zod: un error de TIPO es el
  // único que podría llevar el valor recibido dentro del detalle que viaja de
  // vuelta. Del formato (6 a 12 dígitos) sigue decidiendo `esquemaPinFirma`
  // dentro de `establecerPin`, cuyo mensaje describe la regla y nunca el valor.
  if (typeof pin !== "string") {
    return NextResponse.json({ error: "Captura tu PIN de firma." }, { status: 400 });
  }

  return responder(async () => {
    await establecerPin(usuario.id, pin);
    // Acuse sin eco: la respuesta confirma el cambio y no repite nada de lo
    // que se tecleó.
    return { establecido: true };
  });
}
