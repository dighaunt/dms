"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
  /** El texto que levantó el disparador; se repite en el diálogo para no atender a ciegas. */
  mensaje: string;
  etiquetaTipo: string;
  severidad: "AVISO" | "GRAVE";
  /** Falso para quien no llega al nivel: el botón no se dibuja y se dice por qué. */
  puedeAtender: boolean;
};

/**
 * Largo mínimo de la nota. Es ayuda de captura, no un candado: la autoridad es
 * el zod de `atenderAlerta`, que responde 400 si la nota no llega. Se anticipa
 * aquí para que nadie escriba "ok" y descubra el rechazo después.
 */
const MINIMO_NOTA = 5;

/**
 * Cierra una alerta de Finanzas explicándola.
 *
 * ATENDER NO ES BORRAR, y la pantalla está escrita para que eso no se preste a
 * confusión: la alerta no desaparece de la historia, queda con el nombre de
 * quien la revisó, la hora y lo que encontró. Un faltante de caja atendido
 * sigue habiendo sido un faltante; lo que la nota agrega es la rendición de
 * cuentas que hasta ahora no tenía dónde escribirse —`atendida_por`,
 * `atendida_en` y `nota_atencion` eran columnas muertas—.
 *
 * Por eso la nota es obligatoria y por eso no hay forma de "descartar" una
 * alerta: la única salida es explicarla.
 */
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

      // El servicio distingue haberla atendido de encontrarla ya atendida: si
      // alguien se adelantó, su nombre y su nota son los que quedan y decirlo
      // evita creer que la explicación guardada es la que se acaba de escribir.
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
            <DialogTitle>
              Atender la alerta · {etiquetaTipo}
              {severidad === "GRAVE" ? " (grave)" : ""}
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
              {guardando ? "Guardando…" : "Dar por atendida"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
