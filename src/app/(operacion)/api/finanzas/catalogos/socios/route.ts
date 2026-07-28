import { NextResponse } from "next/server";

import { requerirUsuario } from "@/lib/api";
import { creado, cuerpo, requerirNivelMinimo, responder, textoDeConsulta } from "@/lib/finanzas/api";
import {
  type EntradaRegistrarSocio,
  listarSocios,
  registrarSocio,
} from "@/lib/finanzas/personas";

/**
 * Registro formal de socios.
 *
 * Quién es socio no se deriva de quién tiene cuenta en el DMS: el selector del
 * retiro de utilidades se llenaba con TODOS los usuarios activos, y eso
 * permitía dos cosas que no debían poder pasar —cargarle el anticipo al socio
 * equivocado con un clic, y entregar un "retiro de utilidades" a alguien que
 * no tiene derecho a utilidad alguna—. Ser accionista es una condición
 * jurídica y por eso se registra sobre una persona y con el acta que lo
 * acredita.
 *
 * De ahí el nivel: la lectura queda abierta a cualquier sesión —la pantalla de
 * egresos enseña la posición del socio antes de entregar el dinero—, pero el
 * alta pide N3. Quién es accionista se acredita con un acta, no se teclea al
 * vuelo mientras se captura un vale.
 */
const MENSAJE_N3 =
  "Solo un administrador global (N3) puede registrar a un socio: la calidad de accionista se acredita con el acta que la constituye, no se captura al vuelo";

/**
 * El registro de socios con la posición de cada uno frente al reparto formal.
 *
 * Salen todos los vigentes, incluidos los de saldo cero: un tablero que sólo
 * enumera a los que deben no deja ver a quien no ha recibido nada.
 * `incluirInactivos=1` agrega a los dados de baja, que siguen importando
 * mientras tengan saldo por comprobar.
 */
export async function GET(request: Request) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const incluirInactivos = textoDeConsulta(new URL(request.url), "incluirInactivos") === "1";

  return responder(() => listarSocios({ soloActivos: !incluirInactivos }));
}

/**
 * Registra a una persona como socio.
 *
 * El cuerpo viaja sin remodelar: la autoridad de validación es
 * `esquemaRegistrarSocio`. Que las participaciones de los vigentes no sumen
 * más de 100 lo decide el disparador `socio_participacion_coherente` —hay que
 * mirar a los demás socios en el mismo instante— y llega como 409 con el
 * mensaje del manual.
 *
 * El servicio devuelve null cuando esa persona YA figura como socio vigente:
 * no se sobreescribe su acta por esta vía, porque hacerlo cambiaría en
 * silencio con qué documento se acredita a un accionista. Volver a registrar a
 * quien fue dado de baja sí se admite: un socio puede reingresar, y entonces
 * queda asentado con el acta nueva.
 */
export async function POST(request: Request) {
  const { usuario, error } = await requerirNivelMinimo("N3", MENSAJE_N3);
  if (error) return error;

  const datos = (await cuerpo(request)) as EntradaRegistrarSocio;

  return responder(
    () => registrarSocio(datos, usuario.id),
    (socio) =>
      socio
        ? creado(socio)
        : NextResponse.json(
            {
              error:
                "Esa persona ya figura como socio vigente. Para cambiar su participación o el acta que lo acredita, dale de baja y regístralo de nuevo con el documento que lo sustenta.",
            },
            { status: 409 },
          ),
  );
}
