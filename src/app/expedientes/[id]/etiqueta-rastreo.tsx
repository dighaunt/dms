"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrCodeIcon, PrinterIcon } from "lucide-react";

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

export function EtiquetaRastreo({ expedienteId, numeroExpediente, vin }: {
  expedienteId: number;
  numeroExpediente: string;
  vin: string;
}) {
  const [qr, setQr] = useState<string>("");
  const url = `https://apps.cliquealo.mx/expedientes/${expedienteId}`;
  useEffect(() => {
    void QRCode.toDataURL(url, { width: 320, margin: 1, errorCorrectionLevel: "M" }).then(setQr);
  }, [url]);
  return <Dialog>
    <DialogTrigger asChild><Button size="sm" variant="outline"><QrCodeIcon className="size-3.5" /> Etiqueta de carpeta</Button></DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Etiqueta de rastreo</DialogTitle>
        <DialogDescription>Imprime y pega este QR en la carpeta física. Abre exactamente este expediente en Cliquealo.</DialogDescription>
      </DialogHeader>
      <div id={`etiqueta-expediente-${expedienteId}`} className="mx-auto grid w-72 justify-items-center gap-3 rounded-xl border bg-white p-5 text-center text-black">
        {qr && <img src={qr} alt={`QR del expediente ${numeroExpediente}`} className="size-44" />}
        <div><p className="text-lg font-bold">EXP. {numeroExpediente}</p><p className="font-mono text-xs">{vin}</p></div>
      </div>
      <DialogFooter><Button onClick={() => window.print()}><PrinterIcon className="size-4" /> Imprimir etiqueta</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
