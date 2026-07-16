"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PencilLineIcon } from "lucide-react";
import { toast } from "sonner";

import { patchJson } from "@/lib/cliente-api";
import { separarMiles, soloDigitos } from "@/lib/numeros";
import {
  LONGITUD_MAXIMA_DATO_UNIDAD,
  MAXIMO_KILOMETRAJE_UNIDAD,
  MAXIMO_REFRENDOS_ANIO,
} from "@/lib/unidad";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Los datos de la unidad se capturan al abrir el expediente. Este diálogo sólo
// permite corregir un dato maestro ya registrado; nunca completar el contrato
// de forma aislada.
export function UnidadDatos({
  vin,
  color,
  numMotor,
  kilometraje,
  versionTipo,
  placas,
  entidadEmisora,
  numeroFacturaVigente,
  numeroConstanciaRepuve,
  numeroTarjetaCirculacion,
  refrendosAnio,
}: {
  vin: string;
  color: string | null;
  numMotor: string | null;
  kilometraje: number | null;
  versionTipo: string | null;
  placas: string | null;
  entidadEmisora: string | null;
  numeroFacturaVigente: string | null;
  numeroConstanciaRepuve: string | null;
  numeroTarjetaCirculacion: string | null;
  refrendosAnio: number | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [colorV, setColorV] = useState(color ?? "");
  const [motorV, setMotorV] = useState(numMotor ?? "");
  const [kmV, setKmV] = useState(kilometraje == null ? "" : String(kilometraje));
  const [versionV, setVersionV] = useState(versionTipo ?? "");
  const [placasV, setPlacasV] = useState(placas ?? "");
  const [entidadV, setEntidadV] = useState(entidadEmisora ?? "");
  const [facturaV, setFacturaV] = useState(numeroFacturaVigente ?? "");
  const [repuveV, setRepuveV] = useState(numeroConstanciaRepuve ?? "");
  const [tarjetaV, setTarjetaV] = useState(numeroTarjetaCirculacion ?? "");
  const [refrendosV, setRefrendosV] = useState(
    refrendosAnio == null ? "" : String(refrendosAnio),
  );
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const faltantes = [
      ["color", colorV],
      ["número de motor", motorV],
      ["kilometraje", kmV],
      ["versión o tipo", versionV],
      ["placas", placasV],
      ["entidad emisora", entidadV],
      ["número de factura vigente", facturaV],
      ["número de constancia REPUVE", repuveV],
      ["número de tarjeta de circulación", tarjetaV],
      ["refrendos al año", refrendosV],
    ].filter(([, value]) => value.trim() === "").map(([label]) => label);
    if (faltantes.length > 0) {
      toast.error(`Completa los datos de la unidad: ${faltantes.join(", ")}`);
      return;
    }
    if (kmV !== "" && Number(kmV) > MAXIMO_KILOMETRAJE_UNIDAD) {
      toast.error(`El kilometraje máximo es ${separarMiles(MAXIMO_KILOMETRAJE_UNIDAD)} km`);
      return;
    }
    if (refrendosV !== "" && Number(refrendosV) > MAXIMO_REFRENDOS_ANIO) {
      toast.error(`Los refrendos al año no pueden exceder ${MAXIMO_REFRENDOS_ANIO}`);
      return;
    }
    setGuardando(true);
    try {
      const res = await patchJson(`/api/unidades/${vin}`, {
        color: colorV.trim() || null,
        numMotor: motorV.trim() || null,
        kilometraje: kmV === "" ? null : Number(kmV),
        versionTipo: versionV.trim() || null,
        placas: placasV.trim() || null,
        entidadEmisora: entidadV.trim() || null,
        numeroFacturaVigente: facturaV.trim() || null,
        numeroConstanciaRepuve: repuveV.trim() || null,
        numeroTarjetaCirculacion: tarjetaV.trim() || null,
        refrendosAnio: refrendosV === "" ? null : Number(refrendosV),
      });
      if (!res) return;
      toast.success("Datos de la unidad corregidos; los siguientes documentos los usarán automáticamente");
      setAbierto(false);
      router.refresh();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-6 gap-1.5 px-2 text-[11px]">
          <PencilLineIcon className="size-3" />
          Corregir datos de la unidad
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Corregir datos de la unidad</DialogTitle>
          <DialogDescription>
            Se capturan al abrir el expediente y alimentan formatos y contratos.
            Corrige sólo un dato maestro equivocado; VIN, marca, modelo y año
            vienen de la factura y no se editan aquí.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="unidad-color">Color</Label>
            <Input
              id="unidad-color"
              value={colorV}
              onChange={(e) => setColorV(e.target.value)}
              maxLength={LONGITUD_MAXIMA_DATO_UNIDAD}
              placeholder="Gris plata"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="unidad-motor">N° de motor</Label>
            <Input
              id="unidad-motor"
              value={motorV}
              onChange={(e) => setMotorV(e.target.value)}
              maxLength={LONGITUD_MAXIMA_DATO_UNIDAD}
              placeholder="HR16-123456"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="unidad-km">Kilometraje al ingreso</Label>
            <Input
              id="unidad-km"
              inputMode="numeric"
              value={separarMiles(kmV)}
              onChange={(e) => setKmV(soloDigitos(e.target.value))}
              placeholder="85,000"
              aria-describedby="unidad-km-ayuda"
            />
            <p id="unidad-km-ayuda" className="text-xs text-muted-foreground">
              {kmV
                ? `Se guardará como ${separarMiles(kmV)} km.`
                : "Escribe sólo números; los separadores aparecen automáticamente."}
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="unidad-version">Versión / tipo</Label>
            <Input
              id="unidad-version"
              value={versionV}
              onChange={(e) => setVersionV(e.target.value)}
              maxLength={LONGITUD_MAXIMA_DATO_UNIDAD}
              placeholder="Advance CVT"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="unidad-placas">Placas</Label>
            <Input
              id="unidad-placas"
              value={placasV}
              onChange={(e) => setPlacasV(e.target.value.toUpperCase())}
              maxLength={LONGITUD_MAXIMA_DATO_UNIDAD}
              placeholder="ABC-123-D"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="unidad-entidad">Entidad emisora</Label>
            <Input
              id="unidad-entidad"
              value={entidadV}
              onChange={(e) => setEntidadV(e.target.value)}
              maxLength={LONGITUD_MAXIMA_DATO_UNIDAD}
              placeholder="Jalisco"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="unidad-factura">N° de factura vigente</Label>
            <Input
              id="unidad-factura"
              value={facturaV}
              onChange={(e) => setFacturaV(e.target.value)}
              maxLength={LONGITUD_MAXIMA_DATO_UNIDAD}
              placeholder="A-12345"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="unidad-repuve">N° de constancia REPUVE</Label>
            <Input
              id="unidad-repuve"
              value={repuveV}
              onChange={(e) => setRepuveV(e.target.value)}
              maxLength={LONGITUD_MAXIMA_DATO_UNIDAD}
              placeholder="NO APLICA"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="unidad-tarjeta">N° de tarjeta de circulación</Label>
            <Input
              id="unidad-tarjeta"
              value={tarjetaV}
              onChange={(e) => setTarjetaV(e.target.value)}
              maxLength={LONGITUD_MAXIMA_DATO_UNIDAD}
              placeholder="NO APLICA"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="unidad-refrendos">Refrendos al año</Label>
            <Input
              id="unidad-refrendos"
              inputMode="numeric"
              value={refrendosV}
              onChange={(e) => setRefrendosV(soloDigitos(e.target.value))}
              placeholder="0"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAbierto(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
