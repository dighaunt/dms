// Índice del buscador global del dashboard. El de documentos y manuales es
// estático (se computa una sola vez); el de expedientes depende de la
// consulta del momento y lo arma cada carga de página.

import type { ExpedienteListado } from "@/lib/db/consultas";
import { ETIQUETA_ESTADO_UNIDAD } from "@/lib/estados";
import { NOMBRE_TIPO } from "@/lib/juego-documental";
import { MANUALES } from "@/lib/manuales";

export type ResultadoBusqueda = {
  id: string;
  tipo: "expediente" | "documento" | "manual";
  titulo: string;
  detalle: string;
  href: string;
  texto: string;
};

function indiceDocumental(): ResultadoBusqueda[] {
  return Object.entries(NOMBRE_TIPO).map(([codigo, nombre]) => ({
    id: `documento-${codigo}`,
    tipo: "documento",
    titulo: `${codigo} · ${nombre}`,
    detalle: "Formato o contrato del expediente documental (M-01).",
    href: "/documentacion",
    texto: `${codigo} ${nombre}`,
  }));
}

function indiceManuales(): ResultadoBusqueda[] {
  return MANUALES.map((manual) => ({
    id: `manual-${manual.slug}`,
    tipo: "manual",
    titulo: `${manual.manual} · ${manual.parte} · ${manual.titulo}`,
    detalle: manual.descripcion,
    href: `/manuales/${manual.slug}`,
    texto: [
      manual.manual,
      manual.parte,
      manual.titulo,
      manual.descripcion,
      ...manual.secciones.map((seccion) => seccion.titulo),
    ].join(" "),
  }));
}

/** Documentos y manuales no cambian entre requests: se computa una sola vez. */
export const INDICE_ESTATICO: ResultadoBusqueda[] = [...indiceDocumental(), ...indiceManuales()];

export function indiceExpedientes(expedientes: ExpedienteListado[]): ResultadoBusqueda[] {
  return expedientes.map((expediente) => ({
    id: `expediente-${expediente.id}`,
    tipo: "expediente",
    titulo: `${expediente.numero_expediente} · ${expediente.marca} ${expediente.modelo} ${expediente.anio_modelo}`,
    detalle: `VIN ${expediente.vin} · ${ETIQUETA_ESTADO_UNIDAD[expediente.estado_unidad ?? ""] ?? "Sin estado registrado"}`,
    href: `/expedientes/${expediente.id}`,
    texto: [
      expediente.numero_expediente,
      expediente.vin,
      expediente.marca,
      expediente.modelo,
      String(expediente.anio_modelo),
      expediente.origen,
    ].join(" "),
  }));
}
