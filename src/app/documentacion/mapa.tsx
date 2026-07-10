"use client";

import { useMemo, useState } from "react";
import { DownloadIcon } from "lucide-react";
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { DEPENDENCIAS, FICHAS, type FichaDocumento } from "@/lib/mapa-documental";
import { cn } from "@/lib/utils";

// Posiciones por etapa (columnas) — el flujo va de Adquisición a Venta.
const COLUMNA: Record<string, number> = {
  Adquisición: 0,
  Inspección: 320,
  Expediente: 620,
  Trámites: 940,
  Venta: 940,
};

const FILAS: Record<string, number> = {
  "C-03": 0, "C-04": 130, "F-03": 260, "F-01": 390, "F-02": 520, "F-04": 650,
  "F-05": 130,
  "F-06": 130, "F-07": 300, "F-08": 430,
  "F-09": 560, "F-10": 690,
  "C-01": 0, "C-02": 170, "F-11": 340,
};

function nodoDe(ficha: FichaDocumento, seleccionado: boolean): Node {
  const esContrato = ficha.categoria === "CONTRATO";
  return {
    id: ficha.codigo,
    position: { x: COLUMNA[ficha.etapa] ?? 0, y: FILAS[ficha.codigo] ?? 0 },
    data: {
      label: (
        <div className="text-left">
          <p className="font-mono text-[11px] font-bold">{ficha.codigo}</p>
          <p className="text-[11px] leading-tight">{ficha.nombre}</p>
        </div>
      ),
    },
    style: {
      width: 200,
      borderRadius: 10,
      padding: "8px 12px",
      fontSize: 11,
      border: seleccionado
        ? "2px solid var(--primary)"
        : esContrato
          ? "1px solid oklch(0.7 0.12 60)"
          : "1px solid var(--border)",
      background: esContrato ? "oklch(0.97 0.03 75)" : "var(--background)",
      boxShadow: seleccionado ? "0 0 0 4px color-mix(in oklab, var(--primary) 15%, transparent)" : undefined,
    },
  };
}

const ARISTAS: Edge[] = DEPENDENCIAS.map((d, i) => ({
  id: `e${i}`,
  source: d.de,
  target: d.a,
  label: d.etiqueta,
  labelStyle: { fontSize: 9, fill: "var(--muted-foreground)" },
  labelBgStyle: { fill: "var(--background)", fillOpacity: 0.9 },
  style: { stroke: "color-mix(in oklab, var(--primary) 55%, transparent)", strokeWidth: 1.5 },
  animated: d.etiqueta.includes("candado de venta"),
}));

export function MapaDocumental() {
  const [seleccion, setSeleccion] = useState<string>("F-06");
  const ficha = FICHAS.find((f) => f.codigo === seleccion)!;

  const nodos = useMemo(
    () => FICHAS.map((f) => nodoDe(f, f.codigo === seleccion)),
    [seleccion],
  );

  const madres = DEPENDENCIAS.filter((d) => d.a === seleccion).map((d) => d.de);
  const dependientes = DEPENDENCIAS.filter((d) => d.de === seleccion).map((d) => d.a);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="h-[560px] overflow-hidden rounded-lg border bg-background shadow-xs">
        <ReactFlow
          nodes={nodos}
          edges={ARISTAS}
          onNodeClick={(_, nodo) => setSeleccion(nodo.id)}
          fitView
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          minZoom={0.4}
        >
          <Background gap={18} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      {/* Ficha del documento seleccionado */}
      <aside className="h-fit rounded-lg border bg-background p-5 shadow-xs">
        <p className="font-mono text-xs font-bold text-primary">{ficha.codigo}</p>
        <h3 className="mt-1 text-base font-semibold leading-snug">{ficha.nombre}</h3>
        <div className="mt-2 flex gap-1.5">
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-medium",
              ficha.categoria === "CONTRATO"
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "bg-muted",
            )}
          >
            {ficha.categoria === "CONTRATO" ? "Contrato" : "Formato"}
          </span>
          <span className="rounded-full border bg-muted px-2 py-0.5 text-[10px] font-medium">
            {ficha.etapa}
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {ficha.descripcion}
        </p>

        <a
          href={`/formatos/${ficha.codigo}.pdf`}
          download={`${ficha.codigo} ${ficha.nombre}.pdf`}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border bg-background px-3 py-2 text-xs font-medium shadow-xs hover:bg-accent"
        >
          <DownloadIcon className="size-3.5" />
          Descargar {ficha.categoria === "CONTRATO" ? "contrato" : "formato"} (PDF)
        </a>

        {madres.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
              Documentos madre
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {madres.map((m) => (
                <button
                  key={m}
                  onClick={() => setSeleccion(m)}
                  className="rounded-md border bg-muted px-2 py-1 font-mono text-xs font-medium hover:border-primary hover:text-primary"
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}
        {dependientes.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
              Dependientes
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {dependientes.map((d) => (
                <button
                  key={d}
                  onClick={() => setSeleccion(d)}
                  className="rounded-md border bg-muted px-2 py-1 font-mono text-xs font-medium hover:border-primary hover:text-primary"
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
