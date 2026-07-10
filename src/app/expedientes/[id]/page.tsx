import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { BadgeCheckIcon } from "lucide-react";

import { obtenerExpediente } from "@/lib/db/consultas";
import {
  ETIQUETA_ESTADO_F06,
  ETIQUETA_ESTADO_UNIDAD,
  PUNTO_ESTADO_F06,
  PUNTO_ESTADO_UNIDAD,
} from "@/lib/estados";
import { BlurFade } from "@/components/ui/blur-fade";
import { BotonCopiar } from "@/components/boton-copiar";
import { EstadoBadge } from "@/components/estado-badge";
import { LineaTiempoExpediente } from "./documentos";
import { EmitirFolio } from "./emitir-folio";
import { HistorialTimeline } from "./historial-timeline";

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

  const iniciales = exp.marca.slice(0, 2).toUpperCase();

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
              {exp.color ? ` · ${exp.color}` : ""} · abierto el{" "}
              {format(new Date(exp.abierto_en), "d 'de' MMMM yyyy", { locale: es })} por{" "}
              <span className="font-medium text-foreground">{exp.abierto_por_nombre}</span>
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <EstadoBadge
                etiqueta={ETIQUETA_ESTADO_UNIDAD[exp.estado_unidad] ?? exp.estado_unidad}
                punto={PUNTO_ESTADO_UNIDAD[exp.estado_unidad] ?? "bg-zinc-400"}
              />
              <EstadoBadge
                etiqueta={`F-06: ${ETIQUETA_ESTADO_F06[exp.estado_f06] ?? exp.estado_f06}`}
                punto={PUNTO_ESTADO_F06[exp.estado_f06] ?? "bg-zinc-400"}
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
            <EmitirFolio
              expedienteId={exp.id}
              numeroExpediente={exp.numero_expediente}
              vin={exp.vin}
              origen={exp.origen}
            />
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
          />
        </div>
      </BlurFade>

      <BlurFade delay={0.18}>
        <HistorialTimeline
          historialUnidad={exp.historial_unidad}
          historialF06={exp.historial_f06}
        />
      </BlurFade>
    </div>
  );
}
