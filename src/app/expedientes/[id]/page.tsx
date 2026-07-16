import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { BadgeCheckIcon, CircleAlertIcon } from "lucide-react";

import { query } from "@/lib/db";
import { getUsuarioSesion } from "@/lib/auth/usuario";
import { obtenerExpediente } from "@/lib/db/consultas";
import { separarMiles } from "@/lib/numeros";
import {
  ETIQUETA_ESTADO_F06,
  ETIQUETA_ESTADO_UNIDAD,
  PUNTO_ESTADO_F06,
  PUNTO_ESTADO_UNIDAD,
} from "@/lib/estados";
import { BlurFade } from "@/components/ui/blur-fade";
import { BotonCopiar } from "@/components/boton-copiar";
import { EstadoBadge } from "@/components/estado-badge";
import { AnexosExpediente } from "./anexos";
import { LineaTiempoExpediente } from "./documentos";
import { EmitirFolio } from "./emitir-folio";
import { HistorialTimeline } from "./historial-timeline";
import { UnidadDatos } from "./unidad-datos";
import { CerrarExpediente } from "./cerrar-expediente";
import { EtiquetaRastreo } from "./etiqueta-rastreo";
import { anexosDeOrigen } from "@/lib/anexos";

export const dynamic = "force-dynamic";

export default async function ExpedienteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const idCrudo = (await params).id;
  const id = Number(idCrudo);
  if (!Number.isSafeInteger(id) || id < 1) notFound();

  const exp = await obtenerExpediente(id);
  if (!exp) notFound();
  const usuario = await getUsuarioSesion();

  // Datos complementarios de la unidad (editables; alimentan el prellenado).
  const unidad = await query<{
    num_motor: string | null;
    kilometraje_ingreso: number | null;
    version_tipo: string | null;
    placas: string | null;
    entidad_emisora: string | null;
    numero_factura_vigente: string | null;
    numero_constancia_repuve: string | null;
    numero_tarjeta_circulacion: string | null;
    refrendos_anio: number | null;
  }>(
    `SELECT num_motor, kilometraje_ingreso, version_tipo, placas, entidad_emisora,
            numero_factura_vigente, numero_constancia_repuve,
            numero_tarjeta_circulacion, refrendos_anio
       FROM traza.unidad
      WHERE vin = $1`,
    [exp.vin],
  );
  const { num_motor, kilometraje_ingreso } = unidad.rows[0] ?? {
    num_motor: null,
    kilometraje_ingreso: null,
    version_tipo: null,
    placas: null,
    entidad_emisora: null,
    numero_factura_vigente: null,
    numero_constancia_repuve: null,
    numero_tarjeta_circulacion: null,
    refrendos_anio: null,
  };

  const iniciales = exp.marca.slice(0, 2).toUpperCase();
  const anexosPendientes = anexosDeOrigen(exp.origen)
    .filter((f) => f.exigencia[exp.origen] === "OBLIGATORIO")
    .filter((f) => !exp.anexos.some((a) => a.clave === f.clave)).length;

  return (
    <div className="space-y-6">
      {/* Encabezado de entidad estilo WorkOS: breadcrumb, avatar, título, chips */}
      <BlurFade delay={0.05}>
        <p className="text-sm text-muted-foreground">
          <Link href="/expedientes" className="text-primary hover:underline">
            Expedientes
          </Link>{" "}
          <span className="mx-1">/</span> Detalle del expediente
        </p>
        <div className="mt-3 flex items-start gap-4">
          <div className="flex size-14 items-center justify-center rounded-xl bg-primary/10 text-lg font-bold text-primary">
            {iniciales}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                Expediente {exp.numero_expediente}
              </h1>
              <span className="inline-flex items-center gap-1 rounded bg-muted py-0.5 pl-2 pr-0.5 font-mono text-xs">
                {exp.vin}
                <BotonCopiar texto={exp.vin} />
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                <BadgeCheckIcon className="size-3.5" />
                {exp.origen === "PROPIA" ? "Propia" : "Consignada"}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {exp.marca} {exp.modelo} · {exp.anio_modelo}
              {exp.color ? ` · ${exp.color}` : ""}
              {num_motor ? ` · motor ${num_motor}` : ""}
              {unidad.rows[0]?.placas ? ` · placas ${unidad.rows[0].placas}` : ""}
              {kilometraje_ingreso != null
                ? ` · ${separarMiles(kilometraje_ingreso)} km al ingreso`
                : ""}{" "}
              · abierto el{" "}
              {format(new Date(exp.abierto_en), "d 'de' MMMM yyyy", { locale: es })} por{" "}
              <span className="font-medium text-foreground">{exp.abierto_por_nombre}</span>
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <EstadoBadge
                etiqueta={ETIQUETA_ESTADO_UNIDAD[exp.estado_unidad] ?? exp.estado_unidad}
                punto={PUNTO_ESTADO_UNIDAD[exp.estado_unidad] ?? "bg-zinc-400"}
              />
              {anexosPendientes > 0 && (
                <Link href="#anexos-expediente" className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 shadow-xs transition-colors hover:bg-amber-100">
                  <CircleAlertIcon className="size-3.5 animate-pulse" />
                  {anexosPendientes} actividad{anexosPendientes === 1 ? "" : "es"} pendiente{anexosPendientes === 1 ? "" : "s"}
                </Link>
              )}
              <EstadoBadge
                etiqueta={`F-06: ${ETIQUETA_ESTADO_F06[exp.estado_f06] ?? exp.estado_f06}`}
                punto={PUNTO_ESTADO_F06[exp.estado_f06] ?? "bg-zinc-400"}
              />
              <UnidadDatos
                vin={exp.vin}
                color={exp.color}
                numMotor={num_motor}
                kilometraje={kilometraje_ingreso}
                versionTipo={unidad.rows[0]?.version_tipo ?? null}
                placas={unidad.rows[0]?.placas ?? null}
                entidadEmisora={unidad.rows[0]?.entidad_emisora ?? null}
                numeroFacturaVigente={unidad.rows[0]?.numero_factura_vigente ?? null}
                numeroConstanciaRepuve={unidad.rows[0]?.numero_constancia_repuve ?? null}
                numeroTarjetaCirculacion={unidad.rows[0]?.numero_tarjeta_circulacion ?? null}
                refrendosAnio={unidad.rows[0]?.refrendos_anio ?? null}
              />
            </div>
          </div>
        </div>
      </BlurFade>

      <BlurFade delay={0.12}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">
              Línea de tiempo del expediente
            </h2>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <EtiquetaRastreo expedienteId={exp.id} numeroExpediente={exp.numero_expediente} vin={exp.vin} />
              <CerrarExpediente expedienteId={exp.id} cerrado={exp.cerrado} puedeCerrar={usuario?.nivel === "N3"} />
              {!exp.cerrado && (
                <EmitirFolio
                  expedienteId={exp.id}
                  numeroExpediente={exp.numero_expediente}
                  vin={exp.vin}
                  origen={exp.origen}
                />
              )}
            </div>
          </div>
          <LineaTiempoExpediente
            expedienteId={exp.id}
            numeroExpediente={exp.numero_expediente}
            vin={exp.vin}
            origen={exp.origen}
            estadoUnidad={exp.estado_unidad}
            estadoF06={exp.estado_f06}
            transicionesValidas={exp.transiciones_validas}
            documentos={exp.documentos}
            anexos={exp.anexos}
            excepciones={exp.excepciones}
            anulacionesExcepcionales={exp.anulacionesExcepcionales}
            puedeAnularExcepcionalmente={usuario?.nivel === "N3"}
            solicitudesPendientes={exp.solicitudesPendientes}
          />
        </div>
      </BlurFade>

      <BlurFade delay={0.16}>
        <AnexosExpediente
          expedienteId={exp.id}
          origen={exp.origen}
          anexos={exp.anexos}
        />
      </BlurFade>

      <BlurFade delay={0.2}>
        <HistorialTimeline
          historialUnidad={exp.historial_unidad}
          historialF06={exp.historial_f06}
          excepciones={exp.excepciones}
        />
      </BlurFade>
    </div>
  );
}
