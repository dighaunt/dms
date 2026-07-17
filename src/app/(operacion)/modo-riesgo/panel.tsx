"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CheckIcon, CircleDashedIcon, InfoIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { postJson } from "@/lib/cliente-api";
import { NOMBRE_TIPO } from "@/lib/juego-documental";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import type { SolicitudRiesgo } from "./page";

export function PanelModoRiesgo({ solicitudes }: { solicitudes: SolicitudRiesgo[] }) {
  const router = useRouter();
  const [rechazarSolicitud, setRechazarSolicitud] = useState<SolicitudRiesgo | null>(null);
  const [enviandoId, setEnviandoId] = useState<number | null>(null);

  const pendientes = solicitudes.filter((s) => s.decision_id === null);
  const historial = solicitudes.filter((s) => s.decision_id !== null);

  async function aprobar(solicitud: SolicitudRiesgo) {
    setEnviandoId(solicitud.id);
    try {
      const res = await postJson(`/api/modo-riesgo/solicitudes/${solicitud.id}/decidir`, {
        autorizar: true,
      });
      if (!res) return;
      toast.success(
        `${solicitud.tipo_codigo} · ${NOMBRE_TIPO[solicitud.tipo_codigo] ?? solicitud.tipo_codigo} autorizado para ${solicitud.numero_expediente}`,
      );
      router.refresh();
    } finally {
      setEnviandoId(null);
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">Pendientes</h2>
        {pendientes.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            <CircleDashedIcon className="size-6 text-muted-foreground/50" />
            Sin solicitudes pendientes.
          </div>
        ) : (
          <div className="grid gap-3">
            {pendientes.map((s) => (
              <div key={s.id} className="space-y-3 rounded-lg border bg-background p-4 shadow-xs">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <Link
                      href={`/expedientes/${s.expediente_id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {s.numero_expediente}
                    </Link>
                    <p className="font-mono text-xs text-muted-foreground">{s.vin}</p>
                  </div>
                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                    {s.tipo_codigo} · {NOMBRE_TIPO[s.tipo_codigo] ?? s.tipo_codigo}
                  </Badge>
                </div>
                <p className="text-sm leading-relaxed">{s.motivo}</p>
                <p className="text-xs text-muted-foreground">
                  Solicitado por {s.solicitado_por_nombre} ·{" "}
                  {format(new Date(s.solicitado_en), "d MMM yyyy, HH:mm", { locale: es })}
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={enviandoId === s.id}
                    onClick={() => setRechazarSolicitud(s)}
                  >
                    <XIcon className="size-4" />
                    Rechazar
                  </Button>
                  <AccionAprobar
                    solicitud={s}
                    enviando={enviandoId === s.id}
                    onConfirmar={() => aprobar(s)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">Historial</h2>
        {historial.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay solicitudes decididas.</p>
        ) : (
          <div className="max-h-[28rem] space-y-2 overflow-y-auto rounded-lg border p-2">
            {historial.map((s) => (
              <div key={s.id} className="rounded-md border bg-background p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/expedientes/${s.expediente_id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {s.numero_expediente}
                    </Link>
                    <span className="font-mono text-xs text-muted-foreground">{s.vin}</span>
                    <span className="text-xs text-muted-foreground">
                      {s.tipo_codigo} · {NOMBRE_TIPO[s.tipo_codigo] ?? s.tipo_codigo}
                    </span>
                  </div>
                  {s.autorizada ? (
                    <Badge className="border-emerald-300 bg-emerald-50 text-emerald-700" variant="outline">
                      Aprobada
                    </Badge>
                  ) : (
                    <Badge className="border-red-300 bg-red-50 text-red-700" variant="outline">
                      Rechazada
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-muted-foreground">{s.motivo}</p>
                {!s.autorizada && s.motivo_rechazo && (
                  <p className="mt-1 text-red-700">Motivo del rechazo: {s.motivo_rechazo}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Solicitado por {s.solicitado_por_nombre} ·{" "}
                  {format(new Date(s.solicitado_en), "d MMM yyyy, HH:mm", { locale: es })} — decidido por{" "}
                  {s.decidido_por_nombre} ·{" "}
                  {s.decidido_en && format(new Date(s.decidido_en), "d MMM yyyy, HH:mm", { locale: es })}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {rechazarSolicitud && (
        <DialogRechazar
          solicitud={rechazarSolicitud}
          onClose={() => setRechazarSolicitud(null)}
          onDone={() => {
            setRechazarSolicitud(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function AccionAprobar({
  solicitud,
  enviando,
  onConfirmar,
}: {
  solicitud: SolicitudRiesgo;
  enviando: boolean;
  onConfirmar: () => void | Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" disabled={enviando}>
          <CheckIcon className="size-4" />
          {enviando ? "Aprobando…" : "Aprobar"}
          <InfoIcon className="size-3 opacity-55" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-80">
        <PopoverHeader>
          <PopoverTitle>Aprobar solicitud de modo riesgo</PopoverTitle>
          <PopoverDescription className="leading-relaxed">
            La excepción para {solicitud.tipo_codigo} ·{" "}
            {NOMBRE_TIPO[solicitud.tipo_codigo] ?? solicitud.tipo_codigo} en{" "}
            {solicitud.numero_expediente} queda declarada de inmediato en el expediente.
          </PopoverDescription>
        </PopoverHeader>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setAbierto(false)}>
            Volver
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setAbierto(false);
              void onConfirmar();
            }}
          >
            Confirmar aprobación
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DialogRechazar({
  solicitud,
  onClose,
  onDone,
}: {
  solicitud: SolicitudRiesgo;
  onClose: () => void;
  onDone: () => void;
}) {
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const motivoValido = motivoRechazo.trim().length >= 10;

  async function rechazar() {
    setEnviando(true);
    try {
      const res = await postJson(`/api/modo-riesgo/solicitudes/${solicitud.id}/decidir`, {
        autorizar: false,
        motivoRechazo,
      });
      if (!res) return;
      toast.success(`Solicitud de ${solicitud.numero_expediente} rechazada`);
      onDone();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Rechazar solicitud · {solicitud.tipo_codigo} · {solicitud.numero_expediente}
          </DialogTitle>
          <DialogDescription>
            El rechazo queda en el historial junto con la solicitud original;
            el operador puede volver a solicitarlo si corrige el motivo.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="motivo-rechazo">Motivo del rechazo</Label>
          <Textarea
            id="motivo-rechazo"
            value={motivoRechazo}
            onChange={(e) => setMotivoRechazo(e.target.value)}
            placeholder="El motivo no explica por qué no existe el paquete físico…"
          />
          <p className={cn("text-xs", motivoValido ? "text-muted-foreground" : "text-amber-700")}>
            {motivoRechazo.trim().length}/10 caracteres mínimo
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={enviando}>
            Volver
          </Button>
          <Button variant="destructive" onClick={rechazar} disabled={!motivoValido || enviando}>
            {enviando ? "Rechazando…" : "Rechazar solicitud"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
