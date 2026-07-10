"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { postJsonDetallado } from "@/lib/cliente-api";
import { NOMBRE_TIPO } from "@/lib/juego-documental";
import { toast } from "sonner";
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
import { DialogFolioGenerado, type FolioEmitido } from "./folio-generado";
import { WizardDocumento } from "./wizard-documento";

// El contrato fuente que NO corresponde al origen se deshabilita aquí solo
// como reflejo; el candado real vive en traza.emitir_folio.
export function EmitirFolio({
  expedienteId,
  numeroExpediente,
  vin,
  origen,
}: {
  expedienteId: number;
  numeroExpediente: string;
  vin: string;
  origen: "PROPIA" | "CONSIGNADA";
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);
  const [folioNuevo, setFolioNuevo] = useState<FolioEmitido | null>(null);
  const [documentoEnCaptura, setDocumentoEnCaptura] = useState<number | null>(null);
  const cerrarWizard = useCallback(() => setDocumentoEnCaptura(null), []);

  const fuenteBloqueada = origen === "PROPIA" ? "C-04" : "C-03";
  const fuentePermitida = origen === "PROPIA" ? "C-03" : "C-04";

  async function emitir() {
    if (!tipo) return;
    setEnviando(true);
    try {
      const res = await postJsonDetallado<FolioEmitido>(
        `/api/expedientes/${expedienteId}/documentos`,
        { tipo },
      );
      if (!res.ok) {
        if (res.status === 409) {
          // Candado del manual: la línea de tiempo abre la etapa, ilumina el
          // paso faltante y lo explica ahí (ver activarCandado en documentos).
          setAbierto(false);
          setTipo(undefined);
          window.dispatchEvent(
            new CustomEvent("candado-manual", {
              detail: { mensaje: res.error, tipo },
            }),
          );
        } else {
          toast.error(res.error);
        }
        return;
      }
      setAbierto(false);
      setTipo(undefined);
      setFolioNuevo(res.data);
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            Emitir otro folio
          </Button>
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
              {Object.entries(NOMBRE_TIPO).map(([codigo, nombre]) => (
                <SelectItem
                  key={codigo}
                  value={codigo}
                  disabled={codigo === fuenteBloqueada}
                >
                  {codigo} · {nombre}
                  {codigo === fuenteBloqueada ? " (no aplica a este origen)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <p className="text-xs text-muted-foreground">
            Unidad {origen === "PROPIA" ? "propia" : "consignada"}: su contrato
            fuente es {fuentePermitida}; {fuenteBloqueada} está deshabilitado.
            El apartado (C-01) y la compraventa (C-02) solo se emiten con la
            carátula del expediente (F-06) marcada «Listo para venta».
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

      <DialogFolioGenerado
        folio={folioNuevo}
        numeroExpediente={numeroExpediente}
        vin={vin}
        onCapturar={(documentoId) => {
          setFolioNuevo(null);
          setDocumentoEnCaptura(documentoId);
        }}
        onCerrar={() => setFolioNuevo(null)}
      />
      <WizardDocumento
        key={documentoEnCaptura ?? "cerrado"}
        documentoId={documentoEnCaptura}
        onClose={cerrarWizard}
        onComplete={() => router.refresh()}
      />
    </>
  );
}
