"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { postJson } from "@/lib/cliente-api";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TIPOS: { codigo: string; nombre: string }[] = [
  { codigo: "F-01", nombre: "Ingreso / compra directa de unidad" },
  { codigo: "F-02", nombre: "Acuerdo de consignación" },
  { codigo: "F-03", nombre: "Identificación de contraparte (KYC)" },
  { codigo: "F-04", nombre: "Recibo de compraventa" },
  { codigo: "F-05", nombre: "Checklist de inspección física" },
  { codigo: "F-06", nombre: "Carátula y checklist maestro" },
  { codigo: "F-07", nombre: "Verificación de adeudos y situación" },
  { codigo: "F-08", nombre: "Validación de factura y endosos" },
  { codigo: "F-09", nombre: "Control de trámites vehiculares" },
  { codigo: "F-10", nombre: "Vale de resguardo de documentos y llaves" },
  { codigo: "F-11", nombre: "Acta de entrega de unidad al cliente" },
  { codigo: "C-01", nombre: "Apartado de vehículo" },
  { codigo: "C-02", nombre: "Compraventa — el lote vende" },
  { codigo: "C-03", nombre: "Compraventa — el lote compra" },
  { codigo: "C-04", nombre: "Consignación mercantil" },
];

// El contrato fuente que NO corresponde al origen se deshabilita aquí solo
// como reflejo; el candado real vive en traza.emitir_folio.
export function EmitirFolio({
  expedienteId,
  origen,
}: {
  expedienteId: number;
  origen: "PROPIA" | "CONSIGNADA";
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  const fuenteBloqueada = origen === "PROPIA" ? "C-04" : "C-03";
  const fuentePermitida = origen === "PROPIA" ? "C-03" : "C-04";

  async function emitir() {
    if (!tipo) return;
    setEnviando(true);
    try {
      const res = await postJson<{ folio: string }>(
        `/api/expedientes/${expedienteId}/documentos`,
        { tipo },
      );
      if (!res) return;
      toast.success(`Folio ${res.folio} emitido`);
      setAbierto(false);
      setTipo(undefined);
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button size="sm">Emitir folio</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Emitir folio</DialogTitle>
          <DialogDescription>
            El consecutivo lo asigna la base de datos por tipo y año.
          </DialogDescription>
        </DialogHeader>

        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Tipo de documento" />
          </SelectTrigger>
          <SelectContent>
            {TIPOS.map((t) => (
              <SelectItem
                key={t.codigo}
                value={t.codigo}
                disabled={t.codigo === fuenteBloqueada}
              >
                {t.codigo} · {t.nombre}
                {t.codigo === fuenteBloqueada ? " (no aplica a este origen)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <p className="text-xs text-muted-foreground">
          Unidad {origen === "PROPIA" ? "propia" : "consignada"}: su contrato fuente
          es {fuentePermitida}; {fuenteBloqueada} está deshabilitado. C-01/C-02
          además exigen F-06 en «Listo para venta» (regla de oro).
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => setAbierto(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={emitir} disabled={!tipo || enviando}>
            {enviando ? "Emitiendo…" : "Emitir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
