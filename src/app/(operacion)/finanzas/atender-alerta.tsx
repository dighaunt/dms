"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { IconoSilk } from "@/components/iconos/silk";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  alertaId: number;
  
  mensaje: string;
  etiquetaTipo: string;
  severidad: "AVISO" | "GRAVE";
  
  puedeAtender: boolean;
};

const MINIMO_NOTA = 5;

export function AtenderAlerta({
  alertaId,
  mensaje,
  etiquetaTipo,
  severidad,
  puedeAtender,
}: Props) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);

  const suficiente = nota.trim().length >= MINIMO_NOTA;

  if (!puedeAtender) {
    return (
      <span className="text-xs text-muted-foreground">
        La atiende un supervisor (N2) o el Gerente General (N3)
      </span>
    );
  }

  async function atender() {
    if (!suficiente) return;
    setGuardando(true);
    try {
      const envio = await fetch(`/api/finanzas/alertas/${alertaId}/atender`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nota: nota.trim() }),
      });
      const datos = await envio.json().catch(() => ({}));
      if (!envio.ok) throw new Error(datos.error ?? "No se pudo atender la alerta");

      
      
      toast.success(
        datos.seAtendioAhora === false
          ? `Esa alerta ya la había atendido ${datos.alerta?.atendidaPorNombre ?? "otra persona"}; se conserva su nota`
          : "Alerta atendida: queda con tu nombre, la hora y tu nota",
      );
      setAbierto(false);
      setNota("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo atender la alerta");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-xs"
        onClick={() => setAbierto(true)}
      >
        Atender
      </Button>

      <Dialog open={abierto} onOpenChange={(estado) => !guardando && setAbierto(estado)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {}
              <IconoSilk
                nombre={severidad === "GRAVE" ? "advertencia" : "aviso"}
                className="shrink-0"
              />
              <span>
                Atender la alerta · {etiquetaTipo}
                {severidad === "GRAVE" ? " (grave)" : ""}
              </span>
            </DialogTitle>
            <DialogDescription>
              Atender no borra la alerta: la explica. Queda registrada con tu nombre, la hora y la
              nota que escribas, y ese texto es el descargo de lo que ocurrió.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-3 text-sm">{mensaje}</div>

            <div className="space-y-1.5">
              <Label htmlFor={`nota-alerta-${alertaId}`}>Qué se revisó o cómo se resolvió *</Label>
              <Textarea
                id={`nota-alerta-${alertaId}`}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                rows={4}
                placeholder="Ej.: se recontó el fajo con el gerente y el faltante correspondía a…"
                aria-invalid={nota !== "" && !suficiente}
              />
              <p
                className={`text-xs ${suficiente || nota === "" ? "text-muted-foreground" : "text-destructive"}`}
              >
                Obligatoria: al menos {MINIMO_NOTA} caracteres. Una alerta atendida sin explicación
                no explica nada.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={guardando} onClick={() => setAbierto(false)}>
              Volver
            </Button>
            <Button disabled={guardando || !suficiente} onClick={atender}>
              <IconoSilk nombre="correcto" className="shrink-0" />
              {guardando ? "Guardando…" : "Dar por atendida"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
