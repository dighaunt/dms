import { NextResponse } from "next/server";

import { requerirN3, requerirUsuario, respuesta404 } from "@/lib/api";
import { creado, cuerpo, numeroDeConsulta, responder, textoDeConsulta } from "@/lib/finanzas/api";
import {
  type EntradaActualizarEmpleado,
  type EntradaCrearEmpleado,
  type FiltroEmpleados,
  activarEmpleado,
  actualizarEmpleado,
  crearEmpleado,
  desactivarEmpleado,
  listarEmpleados,
} from "@/lib/finanzas/catalogos";

const MENSAJE_N3 =
  "Solo un administrador global (N3) puede dar de alta, corregir o dar de baja al personal";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { error } = await requerirUsuario();
  if (error) return error;

  const filtro = {
    sucursalId: numeroDeConsulta(url, "sucursal"),
    soloActivos: textoDeConsulta(url, "incluirInactivos") !== "1",
  } as FiltroEmpleados;

  return responder(() => listarEmpleados(filtro));
}

export async function POST(request: Request) {
  const { usuario, error } = await requerirN3(MENSAJE_N3);
  if (error) return error;

  const datos = (await cuerpo(request)) as Record<string, unknown>;
  const entrada = { ...datos, usuario: usuario.id } as EntradaCrearEmpleado;

  return responder(() => crearEmpleado(entrada), creado);
}

export async function PATCH(request: Request) {
  const { usuario, error } = await requerirN3(MENSAJE_N3);
  if (error) return error;

  const datos = (await cuerpo(request)) as Record<string, unknown>;
  const id = Number(datos.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Indica de qué ficha de personal se trata." }, { status: 400 });
  }

  const noEncontrado = (empleado: unknown) =>
    empleado ? NextResponse.json(empleado) : respuesta404("Esa ficha de personal no existe");

  if (typeof datos.activo === "boolean") {
    const activo = datos.activo;
    return responder(
      () => (activo ? activarEmpleado(id, usuario.id) : desactivarEmpleado(id, usuario.id)),
      noEncontrado,
    );
  }

  return responder(
    () => actualizarEmpleado(id, datos as unknown as EntradaActualizarEmpleado),
    noEncontrado,
  );
}
