"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { AnimatePresence, motion } from "motion/react";
import {
  CheckIcon,
  ChevronDownIcon,
  CircleDashedIcon,
  ClipboardCheckIcon,
  FileCheck2Icon,
  FileTextIcon,
  FileX2Icon,
  FolderOpenIcon,
  HandshakeIcon,
  LandmarkIcon,
  ShoppingCartIcon,
} from "lucide-react";
import { toast } from "sonner";

import { CircleCheckIcon } from "@/components/animate-ui/icons/circle-check";
import { LockKeyholeIcon } from "@/components/animate-ui/icons/lock-keyhole";
import {
  animoDeCandado,
  idDeObjetivo,
  objetivoDeCandado,
  type ObjetivoCandado,
} from "@/lib/candados-ui";
import { postJson, postJsonDetallado, sha256Hex } from "@/lib/cliente-api";
import type { DocumentoDetalle } from "@/lib/db/consultas";
import { ETIQUETA_ESTADO_F06, ETIQUETA_ESTADO_UNIDAD } from "@/lib/estados";
import { juegoEsperado, NOMBRE_TIPO, type RequisitoDocumento } from "@/lib/juego-documental";
import { cn } from "@/lib/utils";
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
import { DialogFolioGenerado, type FolioEmitido } from "./folio-generado";

const TIPOS_ACEPTADOS = "application/pdf,image/jpeg,image/png,image/webp";

const ICONO_ETAPA: Record<string, React.ComponentType<{ className?: string }>> = {
  ADQUISICION: ShoppingCartIcon,
  INSPECCION: ClipboardCheckIcon,
  EXPEDIENTE: FolderOpenIcon,
  TRAMITES: LandmarkIcon,
  VENTA: HandshakeIcon,
};

// Etapa de la línea de tiempo en la que «vive» cada estado de la unidad.
const ETAPA_DE_ESTADO: Record<string, string> = {
  EN_RECEPCION: "ADQUISICION",
  EN_INSPECCION: "INSPECCION",
  EXPEDIENTE_INCOMPLETO: "EXPEDIENTE",
  LISTO_PARA_VENTA: "VENTA",
  APARTADA: "VENTA",
  VENDIDA_PEND_ENTREGA: "VENTA",
  ENTREGADA: "VENTA",
  DEVUELTA_CONSIGNANTE: "VENTA",
  BAJA: "VENTA",
};

type EstadoRequisito = "PENDIENTE" | "EMITIDO" | "ESCANEADO" | "CANCELADO";

function estadoDe(docs: DocumentoDetalle[]): EstadoRequisito {
  const vigentes = docs.filter((d) => !d.cancelado);
  if (vigentes.some((d) => d.escaneado)) return "ESCANEADO";
  if (vigentes.length > 0) return "EMITIDO";
  if (docs.length > 0) return "CANCELADO";
  return "PENDIENTE";
}

const ICONO_ESTADO: Record<EstadoRequisito, { icono: React.ComponentType<{ className?: string }>; clase: string }> = {
  PENDIENTE: { icono: CircleDashedIcon, clase: "text-muted-foreground/60" },
  EMITIDO: { icono: FileTextIcon, clase: "text-foreground" },
  ESCANEADO: { icono: FileCheck2Icon, clase: "text-emerald-600" },
  CANCELADO: { icono: FileX2Icon, clase: "text-red-500" },
};

/**
 * Línea de tiempo del expediente: documentos y ciclo de vida UNIDOS.
 * Cada etapa es un folder desplegable con lo que contiene y lo que falta;
 * la acción de avanzar la unidad aparece dentro de la etapa que la destraba,
 * y el estado F-06 vive dentro de la etapa «Expediente».
 */
export function LineaTiempoExpediente({
  expedienteId,
  numeroExpediente,
  vin,
  origen,
  estadoUnidad,
  estadoF06,
  transicionesValidas,
  documentos,
}: {
  expedienteId: number;
  numeroExpediente: string;
  vin: string;
  origen: "PROPIA" | "CONSIGNADA";
  estadoUnidad: string;
  estadoF06: string;
  transicionesValidas: string[];
  documentos: DocumentoDetalle[];
}) {
  const router = useRouter();
  const etapas = juegoEsperado(origen);
  const etapaActual = ETAPA_DE_ESTADO[estadoUnidad] ?? "ADQUISICION";
  const indiceActual = etapas.findIndex((e) => e.codigo === etapaActual);

  const [abiertas, setAbiertas] = useState<Set<string>>(new Set([etapaActual]));
  const [subirDoc, setSubirDoc] = useState<DocumentoDetalle | null>(null);
  const [cancelarDoc, setCancelarDoc] = useState<DocumentoDetalle | null>(null);
  const [pagoDoc, setPagoDoc] = useState<DocumentoDetalle | null>(null);
  const [folioNuevo, setFolioNuevo] = useState<FolioEmitido | null>(null);
  const [emitiendo, setEmitiendo] = useState<string | null>(null);
  const [avanzando, setAvanzando] = useState<string | null>(null);
  const [candado, setCandado] = useState<{ objetivo: ObjetivoCandado; mensaje: string } | null>(null);
  const candadoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Candado del manual (409): abre la etapa que lo destraba, hace scroll,
  // ilumina el paso faltante en rojo y explica ahí mismo qué hacer.
  function activarCandado(mensaje: string, tipoIntentado?: string) {
    const objetivo =
      objetivoDeCandado(mensaje) ??
      (tipoIntentado ? ({ tipo: "requisito", codigo: tipoIntentado } as const) : null);
    if (!objetivo) {
      toast.error(mensaje);
      return;
    }
    const etapaObjetivo =
      objetivo.tipo === "selector-f06"
        ? "EXPEDIENTE"
        : etapas.find((e) => e.requisitos.some((r) => r.tipo === objetivo.codigo))?.codigo;
    if (etapaObjetivo) {
      setAbiertas((prev) => new Set(prev).add(etapaObjetivo));
    }
    setCandado({ objetivo, mensaje });
    if (candadoTimer.current) clearTimeout(candadoTimer.current);
    candadoTimer.current = setTimeout(() => setCandado(null), 15000);
    setTimeout(() => {
      document
        .getElementById(idDeObjetivo(objetivo))
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 350); // tras la animación de apertura del folder
  }

  // El diálogo «Emitir otro folio» (cabecera) avisa por evento para que el
  // candado se explique aquí, sobre la línea de tiempo.
  useEffect(() => {
    function onCandado(e: Event) {
      const det = (e as CustomEvent<{ mensaje: string; tipo?: string }>).detail;
      activarCandado(det.mensaje, det.tipo);
    }
    window.addEventListener("candado-manual", onCandado);
    return () => window.removeEventListener("candado-manual", onCandado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origen]);

  const porTipo = new Map<string, DocumentoDetalle[]>();
  for (const d of documentos) {
    porTipo.set(d.tipo_codigo, [...(porTipo.get(d.tipo_codigo) ?? []), d]);
  }

  // Transiciones del camino feliz asignadas a la etapa que las destraba;
  // el resto (baja, devolución, regresiones) queda en «Otras acciones».
  const transicionesPorEtapa = new Map<string, string[]>();
  const otrasTransiciones: string[] = [];
  for (const hacia of transicionesValidas) {
    let etapa: string | null = null;
    if (hacia === "EN_INSPECCION") etapa = "INSPECCION";
    else if (hacia === "EXPEDIENTE_INCOMPLETO" && estadoUnidad === "EN_INSPECCION")
      etapa = "EXPEDIENTE";
    else if (hacia === "LISTO_PARA_VENTA" && estadoUnidad === "EXPEDIENTE_INCOMPLETO")
      etapa = "EXPEDIENTE";
    else if (["APARTADA", "VENDIDA_PEND_ENTREGA", "ENTREGADA"].includes(hacia))
      etapa = "VENTA";
    if (etapa) transicionesPorEtapa.set(etapa, [...(transicionesPorEtapa.get(etapa) ?? []), hacia]);
    else otrasTransiciones.push(hacia);
  }

  function alternar(codigo: string) {
    setAbiertas((prev) => {
      const s = new Set(prev);
      if (s.has(codigo)) s.delete(codigo);
      else s.add(codigo);
      return s;
    });
  }

  async function emitir(tipo: string) {
    setEmitiendo(tipo);
    setCandado(null);
    try {
      const res = await postJsonDetallado<FolioEmitido>(
        `/api/expedientes/${expedienteId}/documentos`,
        { tipo },
      );
      if (!res.ok) {
        if (res.status === 409) activarCandado(res.error, tipo);
        else toast.error(res.error);
        return;
      }
      setFolioNuevo(res.data);
      router.refresh();
    } finally {
      setEmitiendo(null);
    }
  }

  async function avanzar(hacia: string) {
    setAvanzando(hacia);
    setCandado(null);
    try {
      const res = await postJsonDetallado(`/api/unidades/${vin}/estado`, { hacia });
      if (!res.ok) {
        if (res.status === 409) activarCandado(res.error);
        else toast.error(res.error);
        return;
      }
      toast.success(`Unidad ahora en ${ETIQUETA_ESTADO_UNIDAD[hacia] ?? hacia}`);
      router.refresh();
    } finally {
      setAvanzando(null);
    }
  }

  return (
    <div>
      {etapas.map((etapa, i) => {
        const IconoEtapa = ICONO_ETAPA[etapa.codigo] ?? FolderOpenIcon;
        const abierta = abiertas.has(etapa.codigo);
        const esActual = etapa.codigo === etapaActual;
        const pasada = i < indiceActual;

        const medibles = etapa.requisitos.filter((r) => r.exigencia !== "segun_aplique");
        const completos = medibles.filter((r) => {
          const e = estadoDe(porTipo.get(r.tipo) ?? []);
          return e === "EMITIDO" || e === "ESCANEADO";
        }).length;
        const etapaCompleta = medibles.length > 0 && completos === medibles.length;
        const transiciones = transicionesPorEtapa.get(etapa.codigo) ?? [];

        return (
          <div key={etapa.codigo} className="relative flex gap-4">
            {/* Riel de la línea de tiempo */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "z-10 flex size-9 shrink-0 items-center justify-center rounded-full border-2 bg-background transition-colors",
                  esActual && "border-primary bg-primary/10",
                  !esActual && (pasada || etapaCompleta) && "border-emerald-500 bg-emerald-50",
                  !esActual && !pasada && !etapaCompleta && "border-border",
                )}
              >
                {!esActual && (pasada || etapaCompleta) ? (
                  <CheckIcon className="size-4 text-emerald-600" />
                ) : (
                  <IconoEtapa
                    className={cn("size-4", esActual ? "text-primary" : "text-muted-foreground")}
                  />
                )}
              </div>
              {i < etapas.length - 1 && (
                <div className={cn("w-px flex-1", pasada ? "bg-emerald-300" : "bg-border")} />
              )}
            </div>

            {/* Folder de la etapa */}
            <div className="min-w-0 flex-1 pb-5">
              <button
                type="button"
                onClick={() => alternar(etapa.codigo)}
                className={cn(
                  "flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-background px-4 py-3 text-left shadow-xs transition-colors hover:bg-muted/40",
                  esActual && "border-primary/40",
                )}
              >
                <span className="text-sm font-medium">{etapa.etiqueta}</span>
                {esActual && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                    unidad aquí · {ETIQUETA_ESTADO_UNIDAD[estadoUnidad] ?? estadoUnidad}
                  </span>
                )}
                <span className="flex-1" />
                {medibles.length > 0 && (
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      etapaCompleta ? "font-medium text-emerald-600" : "text-muted-foreground",
                    )}
                  >
                    {completos} de {medibles.length}
                  </span>
                )}
                <ChevronDownIcon
                  className={cn(
                    "size-4 text-muted-foreground transition-transform duration-200",
                    abierta && "rotate-180",
                  )}
                />
              </button>

              <AnimatePresence initial={false}>
                {abierta && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 rounded-lg border bg-background shadow-xs">
                      <ul className="divide-y">
                        {etapa.requisitos.map((req) => (
                          <FilaRequisito
                            key={req.tipo}
                            requisito={req}
                            docs={porTipo.get(req.tipo) ?? []}
                            emitiendo={emitiendo === req.tipo}
                            onEmitir={() => emitir(req.tipo)}
                            onSubir={setSubirDoc}
                            onCancelar={setCancelarDoc}
                            onPago={setPagoDoc}
                            candado={
                              candado?.objetivo.tipo === "requisito" &&
                              candado.objetivo.codigo === req.tipo
                                ? candado
                                : null
                            }
                            onCerrarCandado={() => setCandado(null)}
                          />
                        ))}
                      </ul>

                      {/* Acciones de ciclo de vida que esta etapa destraba */}
                      {(transiciones.length > 0 || etapa.codigo === "EXPEDIENTE") && (
                        <div className="space-y-3 border-t bg-muted/30 px-4 py-3">
                          {etapa.codigo === "EXPEDIENTE" && (
                            <SelectorF06
                              expedienteId={expedienteId}
                              estadoActual={estadoF06}
                              candado={
                                candado?.objetivo.tipo === "selector-f06" ? candado : null
                              }
                              onCerrarCandado={() => setCandado(null)}
                            />
                          )}
                          {transiciones.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                Esta etapa destraba:
                              </span>
                              {transiciones.map((t) => (
                                <Button
                                  key={t}
                                  size="sm"
                                  className="h-7 px-3 text-xs"
                                  disabled={avanzando !== null}
                                  onClick={() => avanzar(t)}
                                >
                                  {avanzando === t
                                    ? "Avanzando…"
                                    : `Avanzar a ${ETIQUETA_ESTADO_UNIDAD[t] ?? t}`}
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        );
      })}

      {otrasTransiciones.length > 0 && (
        <div className="ml-13 flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-4 py-3">
          <span className="text-xs text-muted-foreground">Otras acciones:</span>
          {otrasTransiciones.map((t) => (
            <Button
              key={t}
              size="sm"
              variant="outline"
              className={cn("h-7 px-3 text-xs", t === "BAJA" && "text-destructive")}
              disabled={avanzando !== null}
              onClick={() => avanzar(t)}
            >
              {avanzando === t ? "Aplicando…" : ETIQUETA_ESTADO_UNIDAD[t] ?? t}
            </Button>
          ))}
        </div>
      )}

      <DialogFolioGenerado
        folio={folioNuevo}
        numeroExpediente={numeroExpediente}
        vin={vin}
        onCerrar={() => setFolioNuevo(null)}
      />
      {subirDoc && (
        <DialogSubirEscaneo
          doc={subirDoc}
          onClose={() => setSubirDoc(null)}
          onDone={() => {
            setSubirDoc(null);
            router.refresh();
          }}
        />
      )}
      {cancelarDoc && (
        <DialogCancelar
          doc={cancelarDoc}
          onClose={() => setCancelarDoc(null)}
          onDone={(sustituto) => {
            setCancelarDoc(null);
            if (sustituto) setFolioNuevo(sustituto);
            router.refresh();
          }}
        />
      )}
      {pagoDoc && (
        <DialogPago
          doc={pagoDoc}
          onClose={() => setPagoDoc(null)}
          onDone={() => {
            setPagoDoc(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

type CandadoActivo = { objetivo: ObjetivoCandado; mensaje: string };

// Aviso del candado: explica qué falta junto al paso iluminado y anima a
// completarlo. Se cierra solo a los 15 s o con «Entendido».
function CalloutCandado({
  candado,
  onCerrar,
}: {
  candado: CandadoActivo;
  onCerrar: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", duration: 0.4, bounce: 0.35 }}
      className="mt-2 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5"
      role="alert"
    >
      <LockKeyholeIcon
        animateOnView
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-red-600"
      />
      <div className="min-w-0 flex-1 text-xs leading-relaxed">
        <p className="font-semibold text-red-800">Candado del manual</p>
        <p className="mt-0.5 text-red-700">{candado.mensaje}.</p>
        <p className="mt-1 flex items-center gap-1.5 font-medium text-red-800">
          <CircleCheckIcon
            animateOnView
            aria-hidden="true"
            className="size-3.5 shrink-0"
          />
          <span>{animoDeCandado(candado.objetivo)}</span>
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 shrink-0 px-2 text-[11px] text-red-700 hover:bg-red-100 hover:text-red-800"
        onClick={onCerrar}
      >
        Entendido
      </Button>
    </motion.div>
  );
}

const ESTADOS_F06 = ["INCOMPLETO", "COMPLETO", "LISTO_PARA_VENTA"] as const;

function SelectorF06({
  expedienteId,
  estadoActual,
  candado,
  onCerrarCandado,
}: {
  expedienteId: number;
  estadoActual: string;
  candado: CandadoActivo | null;
  onCerrarCandado: () => void;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<string | undefined>();
  const [selectAbierto, setSelectAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // Con candado activo, el dropdown se abre solo: el siguiente paso a la mano
  // (estado derivado durante el render, sin efecto).
  const [candadoVisto, setCandadoVisto] = useState<CandadoActivo | null>(null);
  if (candado !== candadoVisto) {
    setCandadoVisto(candado);
    if (candado) setSelectAbierto(true);
  }

  async function registrar() {
    if (!estado) return;
    setEnviando(true);
    try {
      const res = await postJson(`/api/expedientes/${expedienteId}/f06`, { estado });
      if (!res) return;
      toast.success(`F-06 ahora en ${ETIQUETA_ESTADO_F06[estado] ?? estado}`);
      setEstado(undefined);
      onCerrarCandado();
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div id="selector-f06">
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-md transition-all",
          candado && "animate-pulse bg-red-50/70 p-2 ring-2 ring-red-500/70",
        )}
      >
        <span className={cn("text-xs", candado ? "font-medium text-red-800" : "text-muted-foreground")}>
          Casilla F-06 (la única que autoriza C-01/C-02):
        </span>
        <Select
          value={estado}
          onValueChange={setEstado}
          open={selectAbierto}
          onOpenChange={setSelectAbierto}
        >
          <SelectTrigger size="sm" className="w-48 bg-background">
            <SelectValue
              placeholder={`Actual: ${ETIQUETA_ESTADO_F06[estadoActual] ?? estadoActual}`}
            />
          </SelectTrigger>
          <SelectContent>
            {ESTADOS_F06.map((e) => (
              <SelectItem key={e} value={e} disabled={e === estadoActual}>
                {ETIQUETA_ESTADO_F06[e]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-3 text-xs"
          onClick={registrar}
          disabled={!estado || enviando}
        >
          {enviando ? "Registrando…" : "Registrar"}
        </Button>
      </div>
      {candado && <CalloutCandado candado={candado} onCerrar={onCerrarCandado} />}
    </div>
  );
}

function FilaRequisito({
  requisito,
  docs,
  emitiendo,
  onEmitir,
  onSubir,
  onCancelar,
  onPago,
  candado,
  onCerrarCandado,
}: {
  requisito: RequisitoDocumento;
  docs: DocumentoDetalle[];
  emitiendo: boolean;
  onEmitir: () => void;
  onSubir: (d: DocumentoDetalle) => void;
  onCancelar: (d: DocumentoDetalle) => void;
  onPago: (d: DocumentoDetalle) => void;
  candado: CandadoActivo | null;
  onCerrarCandado: () => void;
}) {
  const estado = estadoDe(docs);
  const { icono: Icono, clase } = ICONO_ESTADO[estado];

  return (
    <li id={`requisito-${requisito.tipo}`} className="px-4 py-3">
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md transition-all",
          candado && "animate-pulse bg-red-50/70 p-2 ring-2 ring-red-500/70",
        )}
      >
        <Icono className={cn("size-4 shrink-0", clase)} />
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="font-mono text-xs font-semibold">{requisito.tipo}</span>
            <span className="ml-2">{NOMBRE_TIPO[requisito.tipo]}</span>
            {requisito.exigencia === "segun_aplique" && (
              <span className="ml-2 text-[11px] text-muted-foreground">según aplique</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">{requisito.proposito}</p>
        </div>
        {(estado === "PENDIENTE" || estado === "CANCELADO") && (
          <Button
            size="sm"
            variant={requisito.exigencia === "segun_aplique" ? "outline" : "default"}
            className="h-7 px-3 text-xs"
            disabled={emitiendo}
            onClick={onEmitir}
          >
            {emitiendo ? "Emitiendo…" : `Emitir ${requisito.tipo}`}
          </Button>
        )}
      </div>

      {candado && <CalloutCandado candado={candado} onCerrar={onCerrarCandado} />}

      {docs.length > 0 && (
        <ul className="mt-2 space-y-1 border-l pl-6">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className={cn(
                "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2 py-1.5 hover:bg-muted/50",
                doc.cancelado && "opacity-60",
              )}
            >
              <span className="font-mono text-xs font-medium">{doc.folio}</span>
              <BotonCopiar texto={doc.folio} />
              <BadgeDocumento doc={doc} />
              <span className="hidden text-[11px] text-muted-foreground sm:inline">
                {doc.emitido_por_nombre} ·{" "}
                {format(new Date(doc.emitido_en), "d MMM yyyy", { locale: es })}
              </span>
              {doc.sustituido_por_folio && (
                <span className="text-[11px] text-muted-foreground">
                  → {doc.sustituido_por_folio}
                </span>
              )}
              <span className="flex-1" />
              <span className="flex gap-0.5">
                {!doc.cancelado && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    asChild
                  >
                    <a href={`/api/documentos/${doc.id}/formato`} download>
                      PDF prellenado
                    </a>
                  </Button>
                )}
                {!doc.cancelado && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => onSubir(doc)}
                  >
                    Subir escaneo
                  </Button>
                )}
                {doc.version_maxima != null && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() =>
                      window.open(
                        `/api/documentos/${doc.id}/escaneos/${doc.version_maxima}`,
                        "_blank",
                      )
                    }
                  >
                    Ver
                  </Button>
                )}
                {doc.tipo_codigo === "C-02" && !doc.pago_verificado && !doc.cancelado && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => onPago(doc)}
                  >
                    Verificar pago
                  </Button>
                )}
                {!doc.cancelado && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] text-destructive hover:text-destructive"
                    onClick={() => onCancelar(doc)}
                  >
                    Cancelar
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function BadgeDocumento({ doc }: { doc: DocumentoDetalle }) {
  const estado = doc.cancelado ? "CANCELADO" : doc.escaneado ? "ESCANEADO" : "EMITIDO";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-px text-[10px] font-medium",
        estado === "CANCELADO" && "border-red-200 bg-red-50 text-red-700",
        estado === "ESCANEADO" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        estado === "EMITIDO" && "bg-background text-foreground",
      )}
    >
      {estado}
      {estado === "ESCANEADO" && doc.version_maxima != null && doc.version_maxima > 1 && (
        <span className="text-emerald-600">v{doc.version_maxima}</span>
      )}
      {doc.tipo_codigo === "C-02" && doc.pago_verificado && !doc.cancelado && (
        <span className="inline-flex items-center gap-0.5 text-emerald-600">
          · pago
          <CircleCheckIcon
            animateOnView
            aria-label="verificado"
            className="size-3"
          />
        </span>
      )}
    </span>
  );
}

// Dropzone → presign → PUT a R2 → sha256 (Web Crypto) → confirmar.
function DialogSubirEscaneo({
  doc,
  onClose,
  onDone,
}: {
  doc: DocumentoDetalle;
  onClose: () => void;
  onDone: () => void;
}) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function subir() {
    if (!archivo) return;
    setSubiendo(true);
    try {
      const buffer = await archivo.arrayBuffer();
      const sha256 = await sha256Hex(buffer);

      const presign = await postJson<{ url: string; rutaObjeto: string }>(
        `/api/documentos/${doc.id}/escaneos/presign`,
        {
          nombreArchivo: archivo.name,
          tamanoBytes: archivo.size,
          contentType: archivo.type,
        },
      );
      if (!presign) return;

      const put = await fetch(presign.url, {
        method: "PUT",
        headers: { "Content-Type": archivo.type },
        body: archivo,
      });
      if (!put.ok) {
        toast.error(`La subida a R2 falló (${put.status})`);
        return;
      }

      const confirmado = await postJson<{ version: number }>(
        `/api/documentos/${doc.id}/escaneos/confirmar`,
        { sha256, rutaObjeto: presign.rutaObjeto, tamanoBytes: archivo.size },
      );
      if (!confirmado) return;

      toast.success(`Escaneo v${confirmado.version} registrado para ${doc.folio}`);
      onDone();
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Subir escaneo · {doc.folio}</DialogTitle>
          <DialogDescription>
            Documento firmado en papel, escaneado. Un reescaneo crea una versión
            nueva; nunca se edita la anterior.
          </DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrando(false);
            const f = e.dataTransfer.files[0];
            if (f) setArchivo(f);
          }}
          className={cn(
            "flex h-32 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-sm text-muted-foreground transition-colors",
            arrastrando && "border-foreground bg-muted",
          )}
        >
          {archivo ? (
            <>
              <span className="font-medium text-foreground">{archivo.name}</span>
              <span className="text-xs">
                {(archivo.size / 1024 / 1024).toFixed(2)} MB
              </span>
            </>
          ) : (
            <>
              <span>Arrastra el PDF o imagen aquí</span>
              <span className="text-xs">o haz clic para elegir (máx. 25 MB)</span>
            </>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={TIPOS_ACEPTADOS}
          className="hidden"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={subiendo}>
            Cancelar
          </Button>
          <Button onClick={subir} disabled={!archivo || subiendo}>
            {subiendo ? "Subiendo…" : "Subir y registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogCancelar({
  doc,
  onClose,
  onDone,
}: {
  doc: DocumentoDetalle;
  onClose: () => void;
  onDone: (sustituto: FolioEmitido | null) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [sustituir, setSustituir] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function cancelar() {
    setEnviando(true);
    try {
      const res = await postJson<{ sustituto: FolioEmitido | null }>(
        `/api/documentos/${doc.id}/cancelar`,
        {
          motivo,
          ...(sustituir ? { sustituirConTipo: doc.tipo_codigo } : {}),
        },
      );
      if (!res) return;
      toast.success(
        res.sustituto
          ? `${doc.folio} cancelado; sustituido por ${res.sustituto.folio}`
          : `${doc.folio} cancelado`,
      );
      onDone(res.sustituto);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar documento · {doc.folio}</DialogTitle>
          <DialogDescription>
            El documento CANCELADO se conserva en el expediente. La corrección es
            cancelación + folio sustituto del mismo tipo.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="motivo">Motivo</Label>
            <Textarea
              id="motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Error de captura en datos del cliente…"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sustituir}
              onChange={(e) => setSustituir(e.target.checked)}
              className="size-4"
            />
            Emitir folio sustituto del mismo tipo ({doc.tipo_codigo})
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={enviando}>
            Volver
          </Button>
          <Button
            variant="destructive"
            onClick={cancelar}
            disabled={motivo.trim().length === 0 || enviando}
          >
            {enviando ? "Cancelando…" : "Cancelar documento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogPago({
  doc,
  onClose,
  onDone,
}: {
  doc: DocumentoDetalle;
  onClose: () => void;
  onDone: () => void;
}) {
  const [referencia, setReferencia] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function verificar() {
    setEnviando(true);
    try {
      const res = await postJson(`/api/documentos/${doc.id}/pago`, { referencia });
      if (!res) return;
      toast.success(`Pago verificado para ${doc.folio}`);
      onDone();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Verificar pago · {doc.folio}</DialogTitle>
          <DialogDescription>
            Candado del C-02: sin pago verificado no se emite F-11 ni se marca la
            unidad como vendida.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="referencia">Referencia del pago</Label>
          <Input
            id="referencia"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder="SPEI 40012345678901234567"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={enviando}>
            Volver
          </Button>
          <Button
            onClick={verificar}
            disabled={referencia.trim().length === 0 || enviando}
          >
            {enviando ? "Registrando…" : "Verificar pago"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
