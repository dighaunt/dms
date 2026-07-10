"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";
import { SearchIcon } from "lucide-react";

import type { ExpedienteListado } from "@/lib/db/consultas";
import {
  ETIQUETA_ESTADO_F06,
  ETIQUETA_ESTADO_UNIDAD,
  PUNTO_ESTADO_F06,
  PUNTO_ESTADO_UNIDAD,
} from "@/lib/estados";
import { EstadoBadge } from "@/components/estado-badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
    <div className="space-y-4">
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar por expediente, VIN, marca o modelo"
          className="bg-background pl-9"
        />
      </div>

      <div className="overflow-hidden rounded-lg border bg-background shadow-xs">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Expediente</TableHead>
              <TableHead>VIN</TableHead>
              <TableHead>Unidad</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Estado de unidad</TableHead>
              <TableHead>Estado F-06</TableHead>
              <TableHead className="text-right">Días en estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibles.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                  {expedientes.length === 0
                    ? "Sin expedientes. Abre el primero con el botón de arriba."
                    : "Sin resultados para la búsqueda."}
                </TableCell>
              </TableRow>
            )}
            {visibles.map((e) => {
              const dias =
                e.estado_unidad_desde !== null
                  ? differenceInCalendarDays(new Date(), new Date(e.estado_unidad_desde))
                  : null;
              return (
                <TableRow key={e.id} className="relative">
                  <TableCell className="font-medium">
                    <Link
                      href={`/expedientes/${e.id}`}
                      className="after:absolute after:inset-0"
                    >
                      {e.numero_expediente}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{e.vin}</TableCell>
                  <TableCell>
                    {e.marca} {e.modelo} · {e.anio_modelo}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {e.origen === "PROPIA" ? "Propia" : "Consignada"}
                  </TableCell>
                  <TableCell>
                    {e.estado_unidad && (
                      <EstadoBadge
                        etiqueta={ETIQUETA_ESTADO_UNIDAD[e.estado_unidad] ?? e.estado_unidad}
                        punto={PUNTO_ESTADO_UNIDAD[e.estado_unidad] ?? "bg-zinc-400"}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {e.estado_f06 && (
                      <EstadoBadge
                        etiqueta={ETIQUETA_ESTADO_F06[e.estado_f06] ?? e.estado_f06}
                        punto={PUNTO_ESTADO_F06[e.estado_f06] ?? "bg-zinc-400"}
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {dias !== null ? dias : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
