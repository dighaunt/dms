import { NextResponse } from "next/server";

import { requerirUsuario } from "@/lib/api";
import { creado, cuerpo, requerirNivelMinimo, responder, textoDeConsulta } from "@/lib/finanzas/api";
import {
  type EntradaRegistrarSocio,
  listarSocios,
  registrarSocio,
} from "@/lib/finanzas/personas";

const MENSAJE_N3 =
  "Solo un administrador global (N3) puede registrar a un socio: la calidad de accionista se acredita con el acta que la constituye, no se captura al vuelo";

export async function GET(request: Request) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const incluirInactivos = textoDeConsulta(new URL(request.url), "incluirInactivos") === "1";

  return responder(() => listarSocios({ soloActivos: !incluirInactivos }));
}

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
