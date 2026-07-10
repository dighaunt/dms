"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";
import { motion } from "motion/react";
import { FileTextIcon, FolderOpenIcon, SearchIcon } from "lucide-react";

import type { ExpedienteListado } from "@/lib/db/consultas";
import {
  ETIQUETA_ESTADO_F06,
  ETIQUETA_ESTADO_UNIDAD,
  PUNTO_ESTADO_F06,
  PUNTO_ESTADO_UNIDAD,
} from "@/lib/estados";
import { EstadoBadge } from "@/components/estado-badge";
import { BlurFade } from "@/components/ui/blur-fade";
import { Input } from "@/components/ui/input";

// Cada expediente es una «cartera» estilo Wise: la pila de documentos se
// abanica al pasar el cursor y al picarla se abre el expediente con sus
// archivos.
export function TablaExpedientes({ expedientes }: { expedientes: ExpedienteListado[] }) {
  const [filtro, setFiltro] = useState("");

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return expedientes;
    return expedientes.filter((e) =>
      [e.numero_expediente, e.vin, e.marca, e.modelo, String(e.anio_modelo)]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [expedientes, filtro]);

  return (
    <div className="space-y-5">
      <div className="relative max-w-md">
        <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar por expediente, VIN, marca o modelo"
          className="bg-background pl-9"
        />
      </div>

      {visibles.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-background py-16 text-center">
          <FolderOpenIcon className="size-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {expedientes.length === 0
              ? "Sin expedientes. Abre el primero con «Abrir expediente»."
              : "Sin resultados para la búsqueda."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibles.map((e, i) => (
            <BlurFade key={e.id} delay={0.06 + i * 0.05}>
              <TarjetaExpediente expediente={e} />
            </BlurFade>
          ))}
        </div>
      )}
    </div>
  );
}

function TarjetaExpediente({ expediente: e }: { expediente: ExpedienteListado }) {
  const dias =
    e.estado_unidad_desde !== null
      ? differenceInCalendarDays(new Date(), new Date(e.estado_unidad_desde))
      : null;

  return (
    <motion.div whileHover={{ y: -4 }} transition={{ type: "spring", stiffness: 350, damping: 25 }}>
      <Link
        href={`/expedientes/${e.id}`}
        className="group block h-full rounded-xl border bg-background p-5 shadow-xs transition-shadow hover:shadow-md"
      >
        {/* Pila de documentos estilo Wise: se abanica al pasar el cursor */}
        <div className="mb-4 flex items-start justify-between">
          <div className="relative h-14 w-24">
            <div className="absolute left-2 top-1.5 h-11 w-16 rotate-3 rounded-md border bg-muted transition-transform duration-300 group-hover:translate-x-2 group-hover:rotate-6" />
            <div className="absolute left-1 top-1 h-11 w-16 rotate-1 rounded-md border bg-muted/60 transition-transform duration-300 group-hover:translate-x-1 group-hover:rotate-3" />
            <div className="absolute left-0 top-0 flex h-11 w-16 items-center justify-center rounded-md border border-primary/20 bg-primary/10 transition-transform duration-300 group-hover:-rotate-2">
              <FolderOpenIcon className="size-5 text-primary" />
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground">
            <FileTextIcon className="size-3.5" />
            {e.documentos_total}
            {e.documentos_escaneados > 0 && (
              <span className="text-emerald-600">· {e.documentos_escaneados} esc.</span>
            )}
          </span>
        </div>

        <p className="font-mono text-lg font-semibold tracking-tight">
          {e.numero_expediente}
        </p>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          {e.marca} {e.modelo} · {e.anio_modelo} ·{" "}
          {e.origen === "PROPIA" ? "Propia" : "Consignada"}
        </p>
        <p className="mt-1.5 truncate font-mono text-[11px] text-muted-foreground/80">
          {e.vin}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {e.estado_unidad && (
            <EstadoBadge
              etiqueta={ETIQUETA_ESTADO_UNIDAD[e.estado_unidad] ?? e.estado_unidad}
              punto={PUNTO_ESTADO_UNIDAD[e.estado_unidad] ?? "bg-zinc-400"}
            />
          )}
          {e.estado_f06 && (
            <EstadoBadge
              etiqueta={`F-06: ${ETIQUETA_ESTADO_F06[e.estado_f06] ?? e.estado_f06}`}
              punto={PUNTO_ESTADO_F06[e.estado_f06] ?? "bg-zinc-400"}
            />
          )}
          {dias !== null && (
            <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
              {dias === 0 ? "hoy" : `${dias} día${dias === 1 ? "" : "s"} en estado`}
            </span>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
