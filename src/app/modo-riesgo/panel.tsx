"use client";

import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CircleDashedIcon, SearchIcon, ShieldAlertIcon } from "lucide-react";

import { postJson } from "@/lib/cliente-api";
import type { ExpedienteListado } from "@/lib/db/consultas";
import { NOMBRE_TIPO, TIPOS_LEGACY } from "@/lib/juego-documental";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type TokenEmitido = {
  tokenId: number;
  tipoCodigo: string;
  motivo: string;
  emitidoEn: string;
  expiraEn: string;
};

export function PanelModoRiesgo({ expedientes }: { expedientes: ExpedienteListado[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [expediente, setExpediente] = useState<ExpedienteListado | null>(null);
  const [tipoCodigo, setTipoCodigo] = useState<string | undefined>();
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [token, setToken] = useState<TokenEmitido | null>(null);

  const q = busqueda.trim().toLowerCase();
  const resultados =
    q.length === 0
      ? []
      : expedientes
          .filter(
            (e) =>
              e.numero_expediente.toLowerCase().includes(q) ||
              e.vin.toLowerCase().includes(q) ||
              `${e.marca} ${e.modelo}`.toLowerCase().includes(q),
          )
          .slice(0, 8);

  const motivoValido = motivo.trim().length >= 40;
  const listo = expediente !== null && tipoCodigo !== undefined && motivoValido;

  async function emitir() {
    if (!expediente || !tipoCodigo) return;
    setEnviando(true);
    setToken(null);
    try {
      const res = await postJson<TokenEmitido>(
        `/api/expedientes/${expediente.id}/modo-riesgo`,
        { tipoCodigo, motivo },
      );
      if (!res) return;
      setToken(res);
      setMotivo("");
      setTipoCodigo(undefined);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-4 rounded-lg border bg-background p-4 shadow-xs">
        <div className="grid gap-2">
          <Label htmlFor="buscar-expediente">Expediente</Label>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="buscar-expediente"
              value={expediente ? `${expediente.numero_expediente} · ${expediente.vin}` : busqueda}
              onChange={(e) => {
                setExpediente(null);
                setBusqueda(e.target.value);
              }}
              placeholder="Número, VIN, marca o modelo…"
              className="pl-8"
            />
          </div>
          {!expediente && resultados.length > 0 && (
            <div className="overflow-hidden rounded-md border">
              {resultados.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => {
                    setExpediente(e);
                    setBusqueda("");
                  }}
                  className="flex w-full flex-col items-start gap-0.5 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted"
                >
                  <span className="font-medium">{e.numero_expediente}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {e.vin} · {e.marca} {e.modelo} {e.anio_modelo}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="tipo-legacy">Tipo de documento</Label>
          <Select value={tipoCodigo} onValueChange={setTipoCodigo}>
            <SelectTrigger id="tipo-legacy" className="w-full">
              <SelectValue placeholder="Solo Adquisición/Inspección" />
            </SelectTrigger>
            <SelectContent>
              {TIPOS_LEGACY.map((t) => (
                <SelectItem key={t} value={t}>
                  {t} · {NOMBRE_TIPO[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Nunca F-06 en adelante ni C-01/C-02/F-11: modo riesgo no puede
            tocar candados de venta, pago o entrega.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="motivo-token">Motivo</Label>
          <Textarea
            id="motivo-token"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Unidad adquirida en 2017, antes de existir el sistema; no existe el paquete físico día 0…"
          />
          <p className={cn("text-xs", motivoValido ? "text-muted-foreground" : "text-amber-700")}>
            {motivo.trim().length}/40 caracteres mínimo
          </p>
        </div>

        <Button
          type="button"
          variant="destructive"
          className="w-full"
          disabled={!listo || enviando}
          onClick={emitir}
        >
          <ShieldAlertIcon className="size-4" />
          {enviando ? "Emitiendo…" : "Emitir token de modo riesgo"}
        </Button>
        <p className="text-xs text-muted-foreground">
          El token vale 2 horas y se consume una sola vez. No puedes usarlo tú
          mismo para declarar la excepción: debe hacerlo otro usuario desde el
          expediente.
        </p>
      </div>

      <div className="rounded-lg border bg-background p-4 shadow-xs">
        {token ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-700">
              <ShieldAlertIcon className="size-4" />
              <p className="text-sm font-medium">Token emitido</p>
            </div>
            <dl className="divide-y rounded-md border text-sm">
              {[
                ["Tipo", `${token.tipoCodigo} · ${NOMBRE_TIPO[token.tipoCodigo] ?? token.tipoCodigo}`],
                ["Emitido", format(new Date(token.emitidoEn), "d MMM yyyy, HH:mm", { locale: es })],
                ["Expira", format(new Date(token.expiraEn), "d MMM yyyy, HH:mm", { locale: es })],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-3 py-2">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted-foreground">
              Pásale el expediente y el motivo a quien va a declarar la
              excepción; lo hace desde «{token.tipoCodigo}» en la línea de
              tiempo del expediente, dentro de las próximas 2 horas.
            </p>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <CircleDashedIcon className="size-6 text-muted-foreground/50" />
            Aún no se ha emitido ningún token en esta sesión.
          </div>
        )}
      </div>
    </div>
  );
}
