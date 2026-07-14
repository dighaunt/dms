"use client";

import { useState } from "react";
import { LockKeyholeIcon } from "lucide-react";
import { toast } from "sonner";

import { postJsonDetallado } from "@/lib/cliente-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function CerrarExpediente({ expedienteId, cerrado, puedeCerrar }: {
  expedienteId: number;
  cerrado: boolean;
  puedeCerrar: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  if (cerrado) return <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800"><LockKeyholeIcon className="size-3.5" /> Expediente cerrado</span>;
  if (!puedeCerrar) return null;
  async function cerrar() {
    setCerrando(true);
    try {
      const res = await postJsonDetallado(`/api/expedientes/${expedienteId}/cierre`, {});
      if (!res.ok) return toast.error(res.error);
      window.location.reload();
    } finally { setCerrando(false); }
  }
  return <>
    <Button size="sm" variant="outline" onClick={() => setAbierto(true)}><LockKeyholeIcon className="size-3.5" /> Cerrar expediente</Button>
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogContent>
        <DialogHeader><DialogTitle>Cerrar expediente definitivamente</DialogTitle><DialogDescription>La base valida entrega, C-02 con pago, F-11 y anexos obligatorios. Después del cierre, solo N3 puede editarlo.</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" disabled={cerrando} onClick={() => setAbierto(false)}>Volver</Button><Button disabled={cerrando} onClick={() => void cerrar()}>{cerrando ? "Cerrando…" : "Confirmar cierre"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
