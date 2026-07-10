"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PencilLineIcon } from "lucide-react";
import { toast } from "sonner";

import { patchJson } from "@/lib/cliente-api";
import { separarMiles, soloDigitos } from "@/lib/numeros";
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

// Completa los datos de la unidad después de abierto el expediente (color,
// n° de motor, kilometraje al ingreso). Estos campos alimentan el prellenado
// de formatos y contratos: entre más completos, menos se llena a mano.
export function UnidadDatos({
  vin,
  color,
  numMotor,
  kilometraje,
}: {
  vin: string;
  color: string | null;
  numMotor: string | null;
  kilometraje: number | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [colorV, setColorV] = useState(color ?? "");
  const [motorV, setMotorV] = useState(numMotor ?? "");
  const [kmV, setKmV] = useState(kilometraje == null ? "" : String(kilometraje));
  const [guardando, setGuardando] = useState(false);

  const incompleto = !color || !numMotor || kilometraje == null;

  async function guardar() {
    if (kmV !== "" && Number(kmV) > 9_999_999) {
      toast.error(`El kilometraje máximo es ${separarMiles(9_999_999)} km`);
      return;
    }
    setGuardando(true);
    try {
      const res = await patchJson(`/api/unidades/${vin}`, {
        color: colorV.trim() || null,
        numMotor: motorV.trim() || null,
        kilometraje: kmV === "" ? null : Number(kmV),
      });
      if (!res) return;
      toast.success("Datos de la unidad actualizados; los PDFs ya salen con ellos");
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
          {incompleto ? "Completar datos de la unidad" : "Editar datos de la unidad"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Datos de la unidad</DialogTitle>
          <DialogDescription>
            Alimentan el prellenado de formatos y contratos. VIN, marca, modelo
            y año no se editan: vienen de la factura.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="unidad-color">Color</Label>
            <Input
              id="unidad-color"
              value={colorV}
              onChange={(e) => setColorV(e.target.value)}
              placeholder="Gris plata"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="unidad-motor">N° de motor</Label>
            <Input
              id="unidad-motor"
              value={motorV}
              onChange={(e) => setMotorV(e.target.value)}
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
