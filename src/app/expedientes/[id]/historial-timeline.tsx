"use client";

import { useEffect, useRef } from "react";
import { DataSet } from "vis-data";
import { Timeline, type TimelineOptions } from "vis-timeline/standalone";
import "vis-timeline/styles/vis-timeline-graph2d.css";

import type { EventoHistorial } from "@/lib/db/consultas";
import { ETIQUETA_ESTADO_F06, ETIQUETA_ESTADO_UNIDAD } from "@/lib/estados";

const ESTADOS_FINALES = new Set(["ENTREGADA", "DEVUELTA_CONSIGNANTE", "BAJA"]);

// Cada estado se dibuja como RANGO: desde que ocurrió hasta el siguiente
// cambio (o hasta hoy si sigue vigente). Dos pistas: Unidad y F-06.
function aRangos(
  eventos: EventoHistorial[],
  grupo: string,
  etiquetas: Record<string, string>,
) {
  return eventos.map((e, i) => {
    const inicio = new Date(e.ocurrido_en);
    const siguiente = eventos[i + 1];
    const esUltimo = !siguiente;
    const abierto = esUltimo && !ESTADOS_FINALES.has(e.estado);
    return {
      id: `${grupo}-${i}`,
      group: grupo,
      content: etiquetas[e.estado] ?? e.estado,
      title: `${etiquetas[e.estado] ?? e.estado} — ${e.registrado_por_nombre} · ${inicio.toLocaleString("es-MX")}`,
      start: inicio,
      end: siguiente ? new Date(siguiente.ocurrido_en) : new Date(),
      type: "range" as const,
      className: abierto
        ? "traza-rango traza-rango-abierto"
        : ESTADOS_FINALES.has(e.estado) && esUltimo
          ? "traza-rango traza-rango-final"
          : "traza-rango",
    };
  });
}

export function HistorialTimeline({
  historialUnidad,
  historialF06,
}: {
  historialUnidad: EventoHistorial[];
  historialF06: EventoHistorial[];
}) {
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor) return;

    const items = new DataSet([
      ...aRangos(historialUnidad, "unidad", ETIQUETA_ESTADO_UNIDAD),
      ...aRangos(historialF06, "f06", ETIQUETA_ESTADO_F06),
    ]);
    const grupos = new DataSet([
      { id: "unidad", content: "Unidad" },
      { id: "f06", content: "F-06" },
    ]);

    const opciones: TimelineOptions = {
      stack: false,
      locale: "es",
      zoomable: true,
      selectable: false,
      margin: { item: 8 },
      maxHeight: 260,
      tooltip: { followMouse: true },
    };

    const timeline = new Timeline(contenedor, items, grupos, opciones);
    timeline.fit();
    return () => timeline.destroy();
  }, [historialUnidad, historialF06]);

  if (historialUnidad.length === 0) return null;

  return (
    <section className="rounded-lg border bg-background p-4 shadow-xs">
      <h2 className="mb-3 text-sm font-medium">
        Historial del ciclo de vida
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          de la apertura al cierre; arrastra y haz zoom
        </span>
      </h2>
      <div ref={contenedorRef} className="traza-timeline" />
    </section>
  );
}
