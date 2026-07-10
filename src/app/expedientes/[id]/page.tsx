import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { obtenerExpediente } from "@/lib/db/consultas";
import {
  ETIQUETA_ESTADO_F06,
  ETIQUETA_ESTADO_UNIDAD,
  PUNTO_ESTADO_F06,
  PUNTO_ESTADO_UNIDAD,
} from "@/lib/estados";
import { EstadoBadge } from "@/components/estado-badge";
import { TablaDocumentos } from "./documentos";
import { EmitirFolio } from "./emitir-folio";
import { SeccionF06 } from "./f06";
import { StepperCicloVida } from "./stepper";

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

  return (
    <div className="space-y-6">
      {/* Encabezado estilo WorkOS: breadcrumb, título, chips y badges */}
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/expedientes" className="hover:underline">
            Expedientes
          </Link>{" "}
          / {exp.numero_expediente}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Expediente {exp.numero_expediente}
          </h1>
          <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
            {exp.vin}
          </span>
          <EstadoBadge
            etiqueta={ETIQUETA_ESTADO_UNIDAD[exp.estado_unidad] ?? exp.estado_unidad}
            punto={PUNTO_ESTADO_UNIDAD[exp.estado_unidad] ?? "bg-zinc-400"}
          />
          <EstadoBadge
            etiqueta={`F-06: ${ETIQUETA_ESTADO_F06[exp.estado_f06] ?? exp.estado_f06}`}
            punto={PUNTO_ESTADO_F06[exp.estado_f06] ?? "bg-zinc-400"}
          />
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {exp.marca} {exp.modelo} · {exp.anio_modelo}
          {exp.color ? ` · ${exp.color}` : ""} ·{" "}
          {exp.origen === "PROPIA" ? "Propia" : "Consignada"} · abierto el{" "}
          {format(new Date(exp.abierto_en), "d 'de' MMMM yyyy", { locale: es })}
        </p>
      </div>

      <StepperCicloVida
        vin={exp.vin}
        estadoActual={exp.estado_unidad}
        transicionesValidas={exp.transiciones_validas}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Documentos del expediente</h2>
            <EmitirFolio expedienteId={exp.id} origen={exp.origen} />
          </div>
          <TablaDocumentos documentos={exp.documentos} />
        </div>
        <div className="space-y-6">
          <SeccionF06 expedienteId={exp.id} estadoActual={exp.estado_f06} />
        </div>
      </div>
    </div>
  );
}
