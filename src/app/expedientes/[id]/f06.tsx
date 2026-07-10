"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { postJson } from "@/lib/cliente-api";
import { ETIQUETA_ESTADO_F06 } from "@/lib/estados";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ESTADOS = ["INCOMPLETO", "COMPLETO", "LISTO_PARA_VENTA"] as const;

export function SeccionF06({
  expedienteId,
  estadoActual,
}: {
  expedienteId: number;
  estadoActual: string;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  async function registrar() {
    if (!estado) return;
    setEnviando(true);
    try {
      const res = await postJson(`/api/expedientes/${expedienteId}/f06`, { estado });
      if (!res) return;
      toast.success(`F-06 ahora en ${ETIQUETA_ESTADO_F06[estado] ?? estado}`);
      setEstado(undefined);
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="rounded-lg border bg-background p-5">
      <h2 className="text-sm font-medium">F-06 · Carátula y checklist maestro</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        «Listo para venta» es la única casilla que autoriza C-01/C-02.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger className="w-56">
            <SelectValue
              placeholder={`Actual: ${ETIQUETA_ESTADO_F06[estadoActual] ?? estadoActual}`}
            />
          </SelectTrigger>
          <SelectContent>
            {ESTADOS.map((e) => (
              <SelectItem key={e} value={e} disabled={e === estadoActual}>
                {ETIQUETA_ESTADO_F06[e]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={registrar} disabled={!estado || enviando}>
          {enviando ? "Registrando…" : "Registrar estado"}
        </Button>
      </div>
    </section>
  );
}
