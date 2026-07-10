"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "lucide-react";
import { toast } from "sonner";

import { postJson } from "@/lib/cliente-api";
import { CAMINO_FELIZ, ETIQUETA_ESTADO_UNIDAD } from "@/lib/estados";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Stepper horizontal del camino feliz. «Avanzar a X» solo se habilita para
// transiciones válidas (traza.transicion_unidad); si un candado de BD rechaza,
// el 409 se muestra literal en un toast destructivo.
export function StepperCicloVida({
  vin,
  estadoActual,
  transicionesValidas,
}: {
  vin: string;
  estadoActual: string;
  transicionesValidas: string[];
}) {
  const router = useRouter();
  const [enviando, setEnviando] = useState<string | null>(null);
  const indiceActual = CAMINO_FELIZ.indexOf(
    estadoActual as (typeof CAMINO_FELIZ)[number],
  );

  async function avanzar(hacia: string) {
    setEnviando(hacia);
    try {
      const ok = await postJson(`/api/unidades/${vin}/estado`, { hacia });
      if (ok) {
        toast.success(
          `Unidad ahora en ${ETIQUETA_ESTADO_UNIDAD[hacia] ?? hacia}`,
        );
        router.refresh();
      }
    } finally {
      setEnviando(null);
    }
  }

  const transicionesFelices = transicionesValidas.filter((t) =>
    CAMINO_FELIZ.includes(t as (typeof CAMINO_FELIZ)[number]),
  );
  const transicionesOtras = transicionesValidas.filter(
    (t) => !CAMINO_FELIZ.includes(t as (typeof CAMINO_FELIZ)[number]),
  );

  return (
    <section className="rounded-lg border bg-background p-5">
      <h2 className="text-sm font-medium">Ciclo de vida de la unidad</h2>

      <div className="overflow-x-auto"><ol className="mt-4 flex min-w-[640px] items-start">
        {CAMINO_FELIZ.map((estado, i) => {
          const hecho = indiceActual > i;
          const actual = indiceActual === i;
          return (
            <li key={estado} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex w-full items-center">
                <div
                  className={cn(
                    "h-px flex-1",
                    i === 0 ? "bg-transparent" : hecho || actual ? "bg-foreground" : "bg-border",
                  )}
                />
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium",
                    actual && "border-foreground bg-foreground text-background",
                    hecho && "border-foreground bg-background text-foreground",
                    !actual && !hecho && "border-border bg-background text-muted-foreground",
                  )}
                >
                  {hecho ? <CheckIcon className="size-3.5" /> : i + 1}
                </span>
                <div
                  className={cn(
                    "h-px flex-1",
                    i === CAMINO_FELIZ.length - 1
                      ? "bg-transparent"
                      : hecho
                        ? "bg-foreground"
                        : "bg-border",
                  )}
                />
              </div>
              <span
                className={cn(
                  "px-1 text-center text-[11px] leading-tight",
                  actual ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {ETIQUETA_ESTADO_UNIDAD[estado]}
              </span>
            </li>
          );
        })}
      </ol></div>

      {(transicionesFelices.length > 0 || transicionesOtras.length > 0) && (
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
          {transicionesFelices.map((t) => (
            <Button
              key={t}
              size="sm"
              disabled={enviando !== null}
              onClick={() => avanzar(t)}
            >
              {enviando === t
                ? "Avanzando…"
                : `Avanzar a ${ETIQUETA_ESTADO_UNIDAD[t] ?? t}`}
            </Button>
          ))}
          {transicionesOtras.map((t) => (
            <Button
              key={t}
              size="sm"
              variant="outline"
              disabled={enviando !== null}
              onClick={() => avanzar(t)}
              className={cn(t === "BAJA" && "text-destructive")}
            >
              {enviando === t ? "Aplicando…" : ETIQUETA_ESTADO_UNIDAD[t] ?? t}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
