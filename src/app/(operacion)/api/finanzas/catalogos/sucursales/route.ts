import { NextResponse } from "next/server";

import { requerirN3, requerirUsuario, respuesta404 } from "@/lib/api";
import { creado, cuerpo, responder, textoDeConsulta } from "@/lib/finanzas/api";
import {
  type EntradaCrearSucursal,
  activarSucursal,
  crearSucursal,
  desactivarSucursal,
  fijarZonaHorariaSucursal,
  listarSucursales,
} from "@/lib/finanzas/catalogos";

const MENSAJE_N3 =
  "Solo un administrador global (N3) puede dar de alta, dar de baja o cambiar la zona horaria de una sucursal";

export async function GET(request: Request) {
  const { error } = await requerirUsuario();
  if (error) return error;

  const url = new URL(request.url);
  const incluirInactivas = textoDeConsulta(url, "incluirInactivas") === "1";

  return responder(() => listarSucursales({ soloActivas: !incluirInactivas }));
}

export async function POST(request: Request) {
  const { usuario, error } = await requerirN3(MENSAJE_N3);
  if (error) return error;

  const datos = (await cuerpo(request)) as Record<string, unknown>;

  const entrada = { ...datos, usuario: usuario.id } as EntradaCrearSucursal;

  return responder(() => crearSucursal(entrada), creado);
}

export async function PATCH(request: Request) {
  const { error } = await requerirN3(MENSAJE_N3);
  if (error) return error;

  const datos = (await cuerpo(request)) as Record<string, unknown>;

  if (typeof datos.zonaHoraria === "string") {
    return responder(
      () => fijarZonaHorariaSucursal(Number(datos.id), datos.zonaHoraria as string),
      (sucursal) =>
        sucursal ? NextResponse.json(sucursal) : respuesta404("La sucursal no existe"),
    );
  }

  
  
  if (typeof datos.activa !== "boolean") {
    return NextResponse.json(
      { error: "Indica si la sucursal queda activa o inactiva." },
      { status: 400 },
    );
  }

  const id = Number(datos.id);
  const activa = datos.activa;

  return responder(
    () => (activa ? activarSucursal(id) : desactivarSucursal(id)),
    (sucursal) => (sucursal ? NextResponse.json(sucursal) : respuesta404("La sucursal no existe")),
  );
}
