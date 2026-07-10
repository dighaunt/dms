import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";

import { listarExpedientes } from "@/lib/db/consultas";
import {
  ETIQUETA_ESTADO_F06,
  ETIQUETA_ESTADO_UNIDAD,
  PUNTO_ESTADO_F06,
  PUNTO_ESTADO_UNIDAD,
} from "@/lib/estados";
import { EstadoBadge } from "@/components/estado-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function ExpedientesPage() {
  const expedientes = await listarExpedientes();

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Expedientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Un expediente = un VIN = un folio.
          </p>
        </div>
        <Button asChild>
          <Link href="/expedientes/nuevo">Abrir expediente</Link>
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-background">
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
            {expedientes.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                  Sin expedientes. Abre el primero con el botón de arriba.
                </TableCell>
              </TableRow>
            )}
            {expedientes.map((e) => {
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
