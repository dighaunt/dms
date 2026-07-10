"use client";

import { SiAdobeacrobatreader } from "@icons-pack/react-simple-icons";

import { NOMBRE_TIPO } from "@/lib/juego-documental";
import { BotonCopiar } from "@/components/boton-copiar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type FolioEmitido = {
  documentoId: number;
  tipo: string;
  revision: string;
  folio: string;
};

// Ceremonia del folio generado (patrón «API key creada»): el número lo asigna
// el sistema y la persona lo anota tal cual en el formato físico.
export function DialogFolioGenerado({
  folio,
  numeroExpediente,
  vin,
  onCerrar,
}: {
  folio: FolioEmitido | null;
  numeroExpediente: string;
  vin: string;
  onCerrar: () => void;
}) {
  if (!folio) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Folio generado</DialogTitle>
          <DialogDescription>
            {folio.tipo} · {NOMBRE_TIPO[folio.tipo]} · Rev {folio.revision}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2 pl-4">
          <span className="flex-1 truncate font-mono text-lg font-semibold tracking-tight">
            {folio.folio}
          </span>
          <BotonCopiar texto={folio.folio} etiqueta="Copiar" variant="outline" />
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border p-4 text-sm">
          <span className="text-muted-foreground">Expediente</span>
          <span className="text-right font-mono text-xs leading-5">{numeroExpediente}</span>
          <span className="text-muted-foreground">VIN</span>
          <span className="text-right font-mono text-xs leading-5">{vin}</span>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs leading-relaxed text-foreground">
          <SiAdobeacrobatreader
            aria-hidden="true"
            color="#EC1C24"
            className="mt-0.5 size-4 shrink-0"
          />
          <p>
            Descarga y abre el PDF con Adobe Acrobat Reader para conservar los
            campos rellenables. Ya incluye el folio, el expediente y el VIN;
            el consecutivo nunca se escribe a mano.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" asChild>
            <a href={`/api/documentos/${folio.documentoId}/formato`} download>
              <SiAdobeacrobatreader
                aria-hidden="true"
                color="#EC1C24"
                className="size-4"
              />
              Descargar para Acrobat
            </a>
          </Button>
          <Button onClick={onCerrar}>Listo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
