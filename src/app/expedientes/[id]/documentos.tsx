"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  CircleDashedIcon,
  ClipboardCheckIcon,
  FileCheck2Icon,
  FileTextIcon,
  FileX2Icon,
  FolderIcon,
  FolderOpenIcon,
  HandshakeIcon,
  InfoIcon,
  LandmarkIcon,
  LayersIcon,
  ListChecksIcon,
  ListIcon,
  ScanLineIcon,
  ShieldAlertIcon,
  ShoppingCartIcon,
  SkullIcon,
  WalletCardsIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { CircleCheckIcon } from "@/components/animate-ui/icons/circle-check";
import { LockKeyholeIcon } from "@/components/animate-ui/icons/lock-keyhole";
import { GuiaOperativaResumen } from "@/components/guia-operativa-formato";
import {
  animoDeCandado,
  idDeObjetivo,
  objetivoDeCandado,
  type ObjetivoCandado,
} from "@/lib/candados-ui";
import { postJson, postJsonDetallado, sha256Hex } from "@/lib/cliente-api";
import type {
  DocumentoDetalle,
  ExcepcionDocumental,
  SolicitudRiesgoPendiente,
} from "@/lib/db/consultas";
import { ETIQUETA_ESTADO_F06, ETIQUETA_ESTADO_UNIDAD } from "@/lib/estados";
import {
  juegoEsperado,
  NOMBRE_TIPO,
  TIPOS_LEGACY,
  type RequisitoDocumento,
} from "@/lib/juego-documental";
import { DEPENDENCIAS } from "@/lib/mapa-documental";
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
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DialogFolioGenerado, type FolioEmitido } from "./folio-generado";
import { WizardDocumento } from "./wizard-documento";

const TIPOS_ACEPTADOS = "application/pdf,image/jpeg,image/png,image/webp";
const MIMES_ACEPTADOS = new Set(TIPOS_ACEPTADOS.split(","));
const MAX_BYTES_ESCANEO = 25 * 1024 * 1024;

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

type EstadoRequisito = "PENDIENTE" | "EMITIDO" | "ESCANEADO" | "CANCELADO" | "EXCEPCION_LEGACY";

function estadoDe(docs: DocumentoDetalle[], tieneExcepcion = false): EstadoRequisito {
  if (tieneExcepcion) return "EXCEPCION_LEGACY";
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
  EXCEPCION_LEGACY: { icono: ShieldAlertIcon, clase: "text-amber-600" },
};

const EXPLICACION_ESTADO: Record<EstadoRequisito, string> = {
  PENDIENTE: "Todavía no existe un folio. Emitirlo crea un consecutivo permanente en la trazabilidad.",
  EMITIDO: "El folio ya existe y el PDF está disponible; falta cargar el documento firmado o escaneado.",
  ESCANEADO: "Existe al menos un escaneo resguardado. Cada nueva carga crea otra versión y conserva las anteriores.",
  CANCELADO: "El folio se conserva para auditoría, pero ya no admite operaciones. Puede emitirse un sustituto.",
  EXCEPCION_LEGACY:
    "Se declaró, en modo riesgo y con autorización de un administrador (N3), que este papel nunca existió por ser una unidad legacy previa al sistema. Queda visible en el historial para siempre.",
};

type ColorCarpeta = "verde" | "amarillo" | "gris" | "muerto";

// Semáforo de la vista de carpeta: verde completo, amarillo le falta algo
// AHORA (ya debería existir), gris todavía no le toca (etapa futura o
// "según aplique" sin folio), muerto = pérdida real (cancelado sin
// sustituto vigente) o excepción legacy declarada.
function colorCarpetaDe(
  estado: EstadoRequisito,
  requisito: RequisitoDocumento,
  etapaAlcanzada: boolean,
): ColorCarpeta {
  if (estado === "EXCEPCION_LEGACY" || estado === "CANCELADO") return "muerto";
  if (estado === "ESCANEADO") return "verde";
  if (estado === "EMITIDO") return "amarillo";
  if (!etapaAlcanzada || requisito.exigencia === "segun_aplique") return "gris";
  return "amarillo";
}

const ESTILO_CARPETA: Record<
  ColorCarpeta,
  { clase: string; icono: React.ComponentType<{ className?: string }>; etiqueta: string }
> = {
  verde: {
    clase: "border-emerald-300 bg-emerald-50 text-emerald-700",
    icono: CheckIcon,
    etiqueta: "Completo",
  },
  amarillo: {
    clase: "border-amber-300 bg-amber-50 text-amber-700",
    icono: CircleAlertIcon,
    etiqueta: "Le falta",
  },
  gris: {
    clase: "border-border bg-muted/40 text-muted-foreground",
    icono: CircleDashedIcon,
    etiqueta: "Aún no es su ciclo",
  },
  muerto: {
    clase: "border-zinc-400 bg-zinc-200/70 text-zinc-600",
    icono: SkullIcon,
    etiqueta: "Pérdida / legacy",
  },
};

type ConjuntoCarpeta =
  | { tipo: "grupo"; madre: RequisitoDocumento; hijos: { requisito: RequisitoDocumento; etiqueta: string }[] }
  | { tipo: "suelta"; requisito: RequisitoDocumento };

// Reusa DEPENDENCIAS (fuente de verdad del grafo madre → hijo, incluida la
// etiqueta "día 0" del paquete que abrir_expediente emite junto) para saber
// qué pestañas de ESTA etapa comparten documento madre y deben verse dentro
// de un mismo contenedor en vez de sueltas en el wrap.
function agruparConjuntos(requisitos: RequisitoDocumento[]): ConjuntoCarpeta[] {
  const tipos = new Set(requisitos.map((r) => r.tipo));
  const dentroDeEtapa = DEPENDENCIAS.filter((d) => tipos.has(d.de) && tipos.has(d.a));
  const sonHijos = new Set(dentroDeEtapa.map((d) => d.a));

  return requisitos
    .filter((r) => !sonHijos.has(r.tipo))
    .map((r) => {
      const hijos = dentroDeEtapa
        .filter((d) => d.de === r.tipo)
        .map((d) => ({
          requisito: requisitos.find((x) => x.tipo === d.a)!,
          etiqueta: d.etiqueta,
        }));
      return hijos.length > 0
        ? ({ tipo: "grupo", madre: r, hijos } as const)
        : ({ tipo: "suelta", requisito: r } as const);
    });
}

const VARIANTES_CASCADA = {
  apilado: {},
  repartido: { transition: { staggerChildren: 0.09, delayChildren: 0.03 } },
};

const VARIANTES_ETAPA_CASCADA = {
  apilado: { opacity: 0, y: -10, scale: 0.98 },
  repartido: { opacity: 1, y: 0, scale: 1 },
};

// Como si abrieras la carpeta física: un contenedor por documento madre con
// sus hijos adentro (o una pestaña suelta si no comparte madre en esta
// etapa), coloreado por lo que realmente hay. El candado real sigue
// viviendo en BD — esto es solo la lectura visual del expediente. Al hacer
// clic en una pestaña se abre, inline y animado, lo que tiene adentro.
function VistaCarpeta({
  etapas,
  porTipo,
  excepcionPorTipo,
  solicitudPendientePorTipo,
  indiceActual,
}: {
  etapas: ReturnType<typeof juegoEsperado>;
  porTipo: Map<string, DocumentoDetalle[]>;
  excepcionPorTipo: Map<string, ExcepcionDocumental>;
  solicitudPendientePorTipo: Map<string, SolicitudRiesgoPendiente>;
  indiceActual: number;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);

  function alternarPestana(tipo: string) {
    setAbierto((prev) => (prev === tipo ? null : tipo));
  }

  return (
    <div className="mb-6 rounded-2xl border bg-gradient-to-b from-muted/30 to-background p-5">
      <p className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <FolderOpenIcon className="size-3.5" />
        Cada pestaña es un documento que debería existir en esta carpeta. Las que comparten
        documento madre quedan agrupadas; haz clic en una para abrirla.
      </p>
      <motion.div
        initial="apilado"
        animate="repartido"
        variants={VARIANTES_CASCADA}
        className="space-y-5"
      >
        {etapas.map((etapa, i) => {
          const etapaAlcanzada = i <= indiceActual;
          const conjuntos = agruparConjuntos(etapa.requisitos);
          const abiertoEnEtapa = etapa.requisitos.find((r) => r.tipo === abierto) ?? null;

          return (
            <motion.div
              key={etapa.codigo}
              variants={VARIANTES_ETAPA_CASCADA}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            >
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                {etapa.etiqueta}
              </p>
              <div className="flex flex-wrap items-start gap-3">
                {conjuntos.map((c) =>
                  c.tipo === "grupo" ? (
                    <CarpetaMadre
                      key={c.madre.tipo}
                      madre={c.madre}
                      hijos={c.hijos}
                      porTipo={porTipo}
                      excepcionPorTipo={excepcionPorTipo}
                      solicitudPendientePorTipo={solicitudPendientePorTipo}
                      etapaAlcanzada={etapaAlcanzada}
                      abierto={abierto}
                      onAlternar={alternarPestana}
                    />
                  ) : (
                    <PestanaCarpeta
                      key={c.requisito.tipo}
                      requisito={c.requisito}
                      docs={porTipo.get(c.requisito.tipo) ?? []}
                      excepcion={excepcionPorTipo.get(c.requisito.tipo) ?? null}
                      solicitudPendiente={solicitudPendientePorTipo.get(c.requisito.tipo) ?? null}
                      etapaAlcanzada={etapaAlcanzada}
                      abierta={abierto === c.requisito.tipo}
                      onAlternar={() => alternarPestana(c.requisito.tipo)}
                    />
                  ),
                )}
              </div>

              <AnimatePresence initial={false}>
                {abiertoEnEtapa && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <ContenidoCarpeta
                      requisito={abiertoEnEtapa}
                      docs={porTipo.get(abiertoEnEtapa.tipo) ?? []}
                      excepcion={excepcionPorTipo.get(abiertoEnEtapa.tipo) ?? null}
                      solicitudPendiente={solicitudPendientePorTipo.get(abiertoEnEtapa.tipo) ?? null}
                      etapaAlcanzada={etapaAlcanzada}
                      onCerrar={() => setAbierto(null)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </motion.div>
      <div className="mt-5 flex flex-wrap gap-4 border-t pt-4 text-[11px] text-muted-foreground">
        {(Object.keys(ESTILO_CARPETA) as ColorCarpeta[]).map((color) => {
          const { icono: Icono, etiqueta, clase } = ESTILO_CARPETA[color];
          return (
            <span key={color} className="flex items-center gap-1.5">
              <span className={cn("flex size-4 items-center justify-center rounded-full border", clase)}>
                <Icono className="size-2.5" />
              </span>
              {etiqueta}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// Carpeta madre: agrupa visualmente al documento que dispara el conjunto
// (p.ej. C-03/C-04 del paquete día 0, o F-06 con su checklist maestro
// F-07/F-08) junto a los hijos que DEPENDENCIAS marca como emitidos con
// ella o destrabados por ella dentro de esta misma etapa.
function CarpetaMadre({
  madre,
  hijos,
  porTipo,
  excepcionPorTipo,
  solicitudPendientePorTipo,
  etapaAlcanzada,
  abierto,
  onAlternar,
}: {
  madre: RequisitoDocumento;
  hijos: { requisito: RequisitoDocumento; etiqueta: string }[];
  porTipo: Map<string, DocumentoDetalle[]>;
  excepcionPorTipo: Map<string, ExcepcionDocumental>;
  solicitudPendientePorTipo: Map<string, SolicitudRiesgoPendiente>;
  etapaAlcanzada: boolean;
  abierto: string | null;
  onAlternar: (tipo: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed bg-muted/20 p-2.5">
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
        <LayersIcon className="size-3" />
        Conjunto · madre {madre.tipo}
      </p>
      <div className="flex flex-wrap items-start gap-2.5">
        <PestanaCarpeta
          requisito={madre}
          docs={porTipo.get(madre.tipo) ?? []}
          excepcion={excepcionPorTipo.get(madre.tipo) ?? null}
          solicitudPendiente={solicitudPendientePorTipo.get(madre.tipo) ?? null}
          etapaAlcanzada={etapaAlcanzada}
          abierta={abierto === madre.tipo}
          onAlternar={() => onAlternar(madre.tipo)}
          esMadre
        />
        <div className="flex flex-wrap items-start gap-2 border-l pl-2.5">
          {hijos.map(({ requisito, etiqueta }) => (
            <div key={requisito.tipo} className="flex flex-col items-start gap-1">
              <PestanaCarpeta
                requisito={requisito}
                docs={porTipo.get(requisito.tipo) ?? []}
                excepcion={excepcionPorTipo.get(requisito.tipo) ?? null}
                solicitudPendiente={solicitudPendientePorTipo.get(requisito.tipo) ?? null}
                etapaAlcanzada={etapaAlcanzada}
                abierta={abierto === requisito.tipo}
                onAlternar={() => onAlternar(requisito.tipo)}
              />
              <span className="pl-1 text-[9px] text-muted-foreground/70">{etiqueta}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PestanaCarpeta({
  requisito,
  docs,
  excepcion,
  solicitudPendiente,
  etapaAlcanzada,
  abierta,
  onAlternar,
  esMadre = false,
}: {
  requisito: RequisitoDocumento;
  docs: DocumentoDetalle[];
  excepcion: ExcepcionDocumental | null;
  solicitudPendiente: SolicitudRiesgoPendiente | null;
  etapaAlcanzada: boolean;
  abierta: boolean;
  onAlternar: () => void;
  esMadre?: boolean;
}) {
  const estado = estadoDe(docs, excepcion !== null);
  const color = colorCarpetaDe(estado, requisito, etapaAlcanzada);
  const { clase, icono: Icono } = ESTILO_CARPETA[color];
  const solicitudSinResolver = !excepcion && solicitudPendiente !== null;

  return (
    <button
      type="button"
      onClick={onAlternar}
      aria-expanded={abierta}
      aria-label={`${abierta ? "Cerrar" : "Abrir"} carpeta ${requisito.tipo}`}
      className={cn(
        "relative flex min-w-[104px] flex-col items-start gap-1.5 rounded-lg rounded-tl-none border-2 px-3 py-2.5 text-left shadow-sm transition-transform hover:-translate-y-0.5",
        clase,
        esMadre && "min-w-[116px] font-semibold",
        abierta && "-translate-y-0.5 ring-2 ring-primary/50",
      )}
    >
      <span
        aria-hidden="true"
        className={cn("absolute -top-2 left-2.5 h-2 w-7 rounded-t-md border-2 border-b-0", clase)}
      />
      {solicitudSinResolver && (
        <span
          aria-hidden="true"
          className="absolute -inset-0.5 animate-pulse rounded-lg ring-2 ring-amber-400/80"
        />
      )}
      <Icono className="size-3.5" />
      <span className="font-mono text-[11px] font-semibold">{requisito.tipo}</span>
    </button>
  );
}

// Lo que hay "adentro" de la pestaña al abrirla: nombre completo, propósito,
// estado, motivo (excepción o solicitud pendiente) y a quién destraba —
// usando DEPENDENCIAS (de === requisito.tipo) para el grafo, sin limitarlo a
// esta etapa, porque lo que destraba puede vivir etapas más adelante.
function ContenidoCarpeta({
  requisito,
  docs,
  excepcion,
  solicitudPendiente,
  etapaAlcanzada,
  onCerrar,
}: {
  requisito: RequisitoDocumento;
  docs: DocumentoDetalle[];
  excepcion: ExcepcionDocumental | null;
  solicitudPendiente: SolicitudRiesgoPendiente | null;
  etapaAlcanzada: boolean;
  onCerrar: () => void;
}) {
  const estado = estadoDe(docs, excepcion !== null);
  const color = colorCarpetaDe(estado, requisito, etapaAlcanzada);
  const { clase, icono: Icono, etiqueta } = ESTILO_CARPETA[color];
  const destraba = DEPENDENCIAS.filter((d) => d.de === requisito.tipo);

  const detalle = excepcion
    ? `Excepción legacy: ${excepcion.motivo}`
    : solicitudPendiente
      ? `Solicitud enviada, pendiente de aprobación N3: ${solicitudPendiente.motivo}`
      : estado === "CANCELADO"
        ? "Cancelado sin sustituto vigente: pérdida registrada en el expediente."
        : requisito.proposito;

  return (
    <div className="mt-3 rounded-xl border bg-background/70 p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
            {NOMBRE_TIPO[requisito.tipo] ?? requisito.tipo}
            <span className="font-mono text-xs font-normal text-muted-foreground">
              {requisito.tipo}
            </span>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detalle}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Cerrar carpeta ${requisito.tipo}`}
          onClick={onCerrar}
        >
          <ChevronDownIcon className="size-4 rotate-180" />
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            clase,
          )}
        >
          <Icono className="size-3" />
          {etiqueta}
        </span>
        {docs.length > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {docs.length} {docs.length === 1 ? "folio" : "folios"} en este documento
          </span>
        )}
      </div>

      <GuiaOperativaResumen tipo={requisito.tipo} />

      {destraba.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3 text-[11px] text-muted-foreground">
          <ArrowRightIcon className="size-3 shrink-0" />
          destraba:
          {destraba.map((d) => (
            <span
              key={d.a}
              className="rounded-full border bg-muted/40 px-2 py-0.5 font-mono text-[10px] font-medium text-foreground"
              title={d.etiqueta}
            >
              {d.a}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

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
  excepciones,
  solicitudesPendientes,
}: {
  expedienteId: number;
  numeroExpediente: string;
  vin: string;
  origen: "PROPIA" | "CONSIGNADA";
  estadoUnidad: string;
  estadoF06: string;
  transicionesValidas: string[];
  documentos: DocumentoDetalle[];
  excepciones: ExcepcionDocumental[];
  solicitudesPendientes: SolicitudRiesgoPendiente[];
}) {
  const router = useRouter();
  const etapas = juegoEsperado(origen);
  const etapaActual = ETAPA_DE_ESTADO[estadoUnidad] ?? "ADQUISICION";
  const indiceActual = etapas.findIndex((e) => e.codigo === etapaActual);
  const excepcionPorTipo = new Map(excepciones.map((e) => [e.tipo_codigo, e]));
  const solicitudPendientePorTipo = new Map(
    solicitudesPendientes.map((s) => [s.tipo_codigo, s]),
  );

  const [vista, setVista] = useState<"linea" | "carpeta">("linea");
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set([etapaActual]));
  const [subirDoc, setSubirDoc] = useState<DocumentoDetalle | null>(null);
  const [cancelarDoc, setCancelarDoc] = useState<DocumentoDetalle | null>(null);
  const [pagoDoc, setPagoDoc] = useState<DocumentoDetalle | null>(null);
  const [declararTipo, setDeclararTipo] = useState<string | null>(null);
  const [folioNuevo, setFolioNuevo] = useState<FolioEmitido | null>(null);
  const [documentoEnCaptura, setDocumentoEnCaptura] = useState<number | null>(null);
  const [emitiendo, setEmitiendo] = useState<string | null>(null);
  const [avanzando, setAvanzando] = useState<string | null>(null);
  const [candado, setCandado] = useState<{ objetivo: ObjetivoCandado; mensaje: string } | null>(null);
  const candadoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cerrarWizard = useCallback(() => setDocumentoEnCaptura(null), []);

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
      <div className="mb-4 flex justify-end">
        <div className="inline-flex rounded-full border bg-background p-0.5 text-xs shadow-xs">
          <button
            type="button"
            onClick={() => setVista("linea")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-colors",
              vista === "linea"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <ListIcon className="size-3.5" />
            Línea de tiempo
          </button>
          <button
            type="button"
            onClick={() => setVista("carpeta")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-colors",
              vista === "carpeta"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <FolderIcon className="size-3.5" />
            Carpeta
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {vista === "carpeta" && (
          <motion.div
            key="vista-carpeta"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            <VistaCarpeta
              etapas={etapas}
              porTipo={porTipo}
              excepcionPorTipo={excepcionPorTipo}
              solicitudPendientePorTipo={solicitudPendientePorTipo}
              indiceActual={indiceActual}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {vista === "linea" &&
      etapas.map((etapa, i) => {
        const IconoEtapa = ICONO_ETAPA[etapa.codigo] ?? FolderOpenIcon;
        const abierta = abiertas.has(etapa.codigo);
        const esActual = etapa.codigo === etapaActual;
        const pasada = i < indiceActual;

        const medibles = etapa.requisitos.filter((r) => r.exigencia !== "segun_aplique");
        const completos = medibles.filter((r) => {
          const e = estadoDe(porTipo.get(r.tipo) ?? [], excepcionPorTipo.has(r.tipo));
          return e === "EMITIDO" || e === "ESCANEADO" || e === "EXCEPCION_LEGACY";
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

            {/* Wallet padre de la etapa y su árbol documental */}
            <div
              className={cn(
                "min-w-0 flex-1 transition-[padding-bottom] duration-200",
                abierta ? "pb-5" : "pb-10",
              )}
            >
              <div className="relative isolate">
                <AnimatePresence initial={false}>
                  {!abierta &&
                    etapa.requisitos.map((requisito, indice) => {
                      const estadoHijo = estadoDe(
                        porTipo.get(requisito.tipo) ?? [],
                        excepcionPorTipo.has(requisito.tipo),
                      );
                      const desplazamiento = (indice + 1) * 6;

                      return (
                        <motion.div
                          key={requisito.tipo}
                          layoutId={`wallet-requisito-${requisito.tipo}`}
                          aria-hidden="true"
                          initial={{ opacity: 0, y: -8, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{
                            type: "spring",
                            stiffness: 420,
                            damping: 32,
                            delay: indice * 0.035,
                          }}
                          style={{
                            left: desplazamiento,
                            right: desplazamiento,
                            top: desplazamiento,
                            zIndex: -10 - indice,
                          }}
                          className={cn(
                            "absolute h-full rounded-2xl border bg-background shadow-xs",
                            estadoHijo === "ESCANEADO" &&
                              "border-emerald-200 bg-emerald-50/45",
                            estadoHijo === "EMITIDO" && "border-primary/20 bg-primary/[0.025]",
                            estadoHijo === "EXCEPCION_LEGACY" &&
                              "border-amber-200 bg-amber-50/45",
                          )}
                        />
                      );
                    })}
                </AnimatePresence>
                <button
                  type="button"
                  onClick={() => alternar(etapa.codigo)}
                  aria-expanded={abierta}
                  className={cn(
                    "relative flex w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border bg-background px-4 py-3.5 text-left shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:shadow-md",
                    esActual && "border-primary/40 shadow-primary/5",
                    etapaCompleta && !esActual && "border-emerald-200",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-xl border bg-muted/50 text-muted-foreground",
                      esActual && "border-primary/20 bg-primary/10 text-primary",
                      etapaCompleta && !esActual &&
                        "border-emerald-200 bg-emerald-50 text-emerald-600",
                    )}
                  >
                    <WalletCardsIcon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{etapa.etiqueta}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      Etapa padre · {etapa.requisitos.length}{" "}
                      {etapa.requisitos.length === 1 ? "documento hijo" : "documentos hijos"}
                    </span>
                  </span>
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
                        "rounded-full border bg-background px-2.5 py-1 text-xs tabular-nums",
                        etapaCompleta
                          ? "border-emerald-200 font-medium text-emerald-600"
                          : "text-muted-foreground",
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
              </div>

              <AnimatePresence initial={false}>
                {abierta && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="relative ml-1 mt-3 pl-5 sm:ml-5 sm:pl-7">
                      <div
                        aria-hidden="true"
                        className="absolute bottom-5 left-2 top-0 w-px bg-gradient-to-b from-primary/35 via-border to-border sm:left-3"
                      />
                      <motion.ul
                        initial="apilado"
                        animate="repartido"
                        variants={{
                          apilado: {},
                          repartido: {
                            transition: { staggerChildren: 0.055, delayChildren: 0.025 },
                          },
                        }}
                        className="space-y-3"
                      >
                        {etapa.requisitos.map((req, indice) => (
                          <FilaRequisito
                            key={req.tipo}
                            requisito={req}
                            docs={porTipo.get(req.tipo) ?? []}
                            excepcion={excepcionPorTipo.get(req.tipo) ?? null}
                            solicitudPendiente={solicitudPendientePorTipo.get(req.tipo) ?? null}
                            orden={indice}
                            emitiendo={emitiendo === req.tipo}
                            onEmitir={() => emitir(req.tipo)}
                            onSubir={setSubirDoc}
                            onCancelar={setCancelarDoc}
                            onPago={setPagoDoc}
                            onCapturar={setDocumentoEnCaptura}
                            onDeclararExcepcion={setDeclararTipo}
                            candado={
                              candado?.objetivo.tipo === "requisito" &&
                              candado.objetivo.codigo === req.tipo
                                ? candado
                                : null
                            }
                            onCerrarCandado={() => setCandado(null)}
                          />
                        ))}
                      </motion.ul>

                      {/* Acciones de ciclo de vida que esta etapa destraba */}
                      {(transiciones.length > 0 || etapa.codigo === "EXPEDIENTE") && (
                        <div className="relative mt-3 space-y-3 rounded-xl border bg-muted/25 px-4 py-3 shadow-xs before:absolute before:-left-5 before:top-6 before:h-px before:w-5 before:bg-border sm:before:-left-7 sm:before:w-7">
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
                                <AccionExplicada
                                  key={t}
                                  etiqueta={
                                    avanzando === t
                                      ? "Avanzando…"
                                      : `Avanzar a ${ETIQUETA_ESTADO_UNIDAD[t] ?? t}`
                                  }
                                  titulo={`Avanzar a ${ETIQUETA_ESTADO_UNIDAD[t] ?? t}`}
                                  descripcion="Actualiza el estado operativo de la unidad. Los candados del manual volverán a validar que todos los documentos necesarios estén completos."
                                  confirmar="Confirmar avance"
                                  className="h-7 px-3 text-xs"
                                  disabled={avanzando !== null}
                                  onConfirmar={() => avanzar(t)}
                                  variant="default"
                                />
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
            <AccionExplicada
              key={t}
              etiqueta={avanzando === t ? "Aplicando…" : ETIQUETA_ESTADO_UNIDAD[t] ?? t}
              titulo={ETIQUETA_ESTADO_UNIDAD[t] ?? t}
              descripcion={
                t === "BAJA"
                  ? "Marca la unidad como baja y la saca del flujo operativo normal. Verifica el expediente antes de continuar."
                  : "Aplica una transición fuera del camino principal y conserva el cambio en el historial de la unidad."
              }
              confirmar={t === "BAJA" ? "Confirmar baja" : "Aplicar cambio"}
              variant="outline"
              className={cn("h-7 px-3 text-xs", t === "BAJA" && "text-destructive")}
              disabled={avanzando !== null}
              onConfirmar={() => avanzar(t)}
              peligrosa={t === "BAJA"}
            />
          ))}
        </div>
      )}

      <DialogFolioGenerado
        folio={folioNuevo}
        numeroExpediente={numeroExpediente}
        vin={vin}
        onCapturar={(documentoId) => {
          setFolioNuevo(null);
          setDocumentoEnCaptura(documentoId);
        }}
        onCerrar={() => setFolioNuevo(null)}
      />
      <WizardDocumento
        key={documentoEnCaptura ?? "cerrado"}
        documentoId={documentoEnCaptura}
        onClose={cerrarWizard}
        onComplete={() => router.refresh()}
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
      {declararTipo && (
        <DialogSolicitarExcepcion
          expedienteId={expedienteId}
          tipoCodigo={declararTipo}
          nombreTipo={NOMBRE_TIPO[declararTipo] ?? declararTipo}
          onClose={() => setDeclararTipo(null)}
          onDone={() => {
            setDeclararTipo(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

type CandadoActivo = { objetivo: ObjetivoCandado; mensaje: string };

type VarianteAccion = "default" | "outline" | "ghost" | "destructive";

function AccionExplicada({
  etiqueta,
  titulo,
  descripcion,
  confirmar,
  onConfirmar,
  disabled = false,
  variant = "outline",
  className,
  icono,
  peligrosa = false,
}: {
  etiqueta: string;
  titulo: string;
  descripcion: string;
  confirmar: string;
  onConfirmar: () => void | Promise<void>;
  disabled?: boolean;
  variant?: VarianteAccion;
  className?: string;
  icono?: React.ReactNode;
  peligrosa?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button type="button" variant={variant} size="sm" className={className} disabled={disabled}>
          {icono}
          {etiqueta}
          <InfoIcon className="size-3 opacity-55" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-80">
        <PopoverHeader>
          <PopoverTitle>{titulo}</PopoverTitle>
          <PopoverDescription className="leading-relaxed">{descripcion}</PopoverDescription>
        </PopoverHeader>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setAbierto(false)}>
            Volver
          </Button>
          <Button
            type="button"
            variant={peligrosa ? "destructive" : "default"}
            size="sm"
            onClick={() => {
              setAbierto(false);
              void onConfirmar();
            }}
          >
            {confirmar}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AbrirWizardButton({ onOpen }: { onOpen: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={onOpen}>
      <ListChecksIcon className="size-3" />
      Completar PDF
    </Button>
  );
}

function EstadoRequisitoPopover({
  estado,
  className,
  children,
}: {
  estado: EstadoRequisito;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-[10px] font-semibold tracking-wide outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
            className,
          )}
          aria-label={`${estado}: ver significado`}
        >
          {estado}
          {children}
          <InfoIcon className="size-3 opacity-55" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-72">
        <PopoverHeader>
          <PopoverTitle>{estado}</PopoverTitle>
          <PopoverDescription className="leading-relaxed">
            {EXPLICACION_ESTADO[estado]}
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

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

// Aviso permanente (no expira, no se cierra): deja constancia visible de qué
// se declaró inexistente, quién lo pidió y qué N3 lo autorizó en modo riesgo.
function CalloutExcepcionLegacy({ excepcion }: { excepcion: ExcepcionDocumental }) {
  return (
    <div className="mt-2 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
      <ShieldAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1 text-xs leading-relaxed">
        <p className="font-semibold text-amber-800">Excepción legacy declarada</p>
        <p className="mt-0.5 text-amber-800">{excepcion.motivo}</p>
        <p className="mt-1 text-amber-700">
          Solicitada por {excepcion.solicitado_por_nombre} el{" "}
          {format(new Date(excepcion.solicitado_en), "d MMM yyyy", { locale: es })} · autorizada en
          modo riesgo por {excepcion.autorizado_por_nombre}
        </p>
      </div>
    </div>
  );
}

// Aviso provisional: la solicitud ya salió, pero todavía no hay decisión de
// un N3. Más liviano que CalloutExcepcionLegacy porque puede resolverse en
// cualquier sentido (aprobar o rechazar) desde /modo-riesgo.
function CalloutSolicitudPendiente({ solicitud }: { solicitud: SolicitudRiesgoPendiente }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mt-2 flex w-full items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-800 transition-colors hover:bg-amber-100"
        >
          <ShieldAlertIcon aria-hidden="true" className="size-3.5 shrink-0 text-amber-600" />
          <span className="font-medium">Solicitud enviada, pendiente de aprobación N3</span>
          <InfoIcon className="ml-auto size-3 shrink-0 opacity-55" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72">
        <PopoverHeader>
          <PopoverTitle>Excepción legacy solicitada</PopoverTitle>
          <PopoverDescription className="leading-relaxed">
            {solicitud.motivo}
          </PopoverDescription>
        </PopoverHeader>
        <p className="mt-3 text-xs text-muted-foreground">
          Solicitada por {solicitud.solicitado_por_nombre} el{" "}
          {format(new Date(solicitud.solicitado_en), "d MMM yyyy", { locale: es })} · a la espera
          de que un administrador (N3) la apruebe o la rechace desde /modo-riesgo.
        </p>
      </PopoverContent>
    </Popover>
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
        <AccionExplicada
          etiqueta={enviando ? "Registrando…" : "Registrar"}
          titulo="Registrar estado de la carátula F-06"
          descripcion={
            estado === "LISTO_PARA_VENTA"
              ? "Marca la carátula como Lista para venta. Este estado autoriza la emisión de C-01 y C-02 cuando los demás candados estén completos."
              : `Guarda la carátula como ${estado ? (ETIQUETA_ESTADO_F06[estado] ?? estado) : "el estado seleccionado"}.`
          }
          confirmar="Registrar estado"
          variant="outline"
          className="h-8 px-3 text-xs"
          disabled={!estado || enviando}
          onConfirmar={registrar}
        />
      </div>
      {candado && <CalloutCandado candado={candado} onCerrar={onCerrarCandado} />}
    </div>
  );
}

function FilaRequisito({
  requisito,
  docs,
  excepcion,
  solicitudPendiente,
  orden,
  emitiendo,
  onEmitir,
  onSubir,
  onCancelar,
  onPago,
  onCapturar,
  onDeclararExcepcion,
  candado,
  onCerrarCandado,
}: {
  requisito: RequisitoDocumento;
  docs: DocumentoDetalle[];
  excepcion: ExcepcionDocumental | null;
  solicitudPendiente: SolicitudRiesgoPendiente | null;
  orden: number;
  emitiendo: boolean;
  onEmitir: () => void;
  onSubir: (d: DocumentoDetalle) => void;
  onCancelar: (d: DocumentoDetalle) => void;
  onPago: (d: DocumentoDetalle) => void;
  onCapturar: (documentoId: number) => void;
  onDeclararExcepcion: (tipoCodigo: string) => void;
  candado: CandadoActivo | null;
  onCerrarCandado: () => void;
}) {
  const estado = estadoDe(docs, excepcion !== null);
  const { icono: Icono, clase } = ICONO_ESTADO[estado];
  const esExcepcionable = (TIPOS_LEGACY as readonly string[]).includes(requisito.tipo);
  const [abierta, setAbierta] = useState(true);
  const expandida = abierta || candado !== null;

  return (
    <li
      id={`requisito-${requisito.tipo}`}
      className={cn(
        "relative transition-[padding-bottom] duration-200",
        !expandida && docs.length > 0 && "pb-4",
      )}
    >
      <span
        aria-hidden="true"
        className="absolute -left-3 top-8 h-px w-3 bg-border sm:-left-4 sm:w-4"
      />
      <span
        aria-hidden="true"
        className={cn(
          "absolute -left-[15px] top-[29px] size-2 rounded-full border-2 border-background bg-border sm:-left-[19px]",
          estado === "ESCANEADO" && "bg-emerald-500",
          estado === "EMITIDO" && "bg-primary",
          candado && "bg-red-500",
        )}
      />

      <motion.div
        layout
        layoutId={`wallet-requisito-${requisito.tipo}`}
        variants={{
          apilado: {
            opacity: 0,
            y: -14,
            rotate: orden % 2 === 0 ? -0.6 : 0.6,
            scale: 0.985,
          },
          repartido: {
            opacity: 1,
            y: 0,
            rotate: 0,
            scale: 1,
          },
        }}
        whileHover={{ y: -2 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        className="relative isolate"
      >
        <AnimatePresence initial={false}>
          {!expandida &&
            docs.slice(0, 3).map((doc, indice) => {
              const desplazamiento = (indice + 1) * 5;

              return (
                <motion.div
                  key={doc.id}
                  layoutId={`wallet-documento-${doc.id}`}
                  aria-hidden="true"
                  initial={{ opacity: 0, y: -6, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    type: "spring",
                    stiffness: 420,
                    damping: 32,
                    delay: indice * 0.035,
                  }}
                  style={{
                    left: desplazamiento,
                    right: desplazamiento,
                    top: desplazamiento,
                    zIndex: -10 - indice,
                  }}
                  className={cn(
                    "absolute h-full rounded-2xl border bg-background shadow-xs",
                    doc.escaneado && "border-emerald-200 bg-emerald-50/45",
                    doc.cancelado && "border-red-200 bg-red-50/50",
                  )}
                />
              );
            })}
        </AnimatePresence>
        <div
          className={cn(
            "relative rounded-2xl border bg-gradient-to-br from-background via-background to-muted/25 p-3.5 shadow-sm transition-all sm:p-4",
            estado === "ESCANEADO" && "border-emerald-200/80",
            candado && "animate-pulse border-red-300 ring-2 ring-red-500/60",
          )}
        >
          <div className="flex flex-wrap items-start gap-3">
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl border bg-background shadow-xs",
                estado === "ESCANEADO" && "border-emerald-200 bg-emerald-50",
                estado === "CANCELADO" && "border-red-200 bg-red-50",
              )}
            >
              <Icono className={cn("size-4", clase)} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold text-primary">
                  {requisito.tipo}
                </span>
                <span className="text-sm font-semibold">{NOMBRE_TIPO[requisito.tipo]}</span>
                {requisito.exigencia === "segun_aplique" && (
                  <span className="rounded-full border bg-background px-2 py-px text-[10px] text-muted-foreground">
                    según aplique
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{requisito.proposito}</p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
                Documento hijo · {docs.length} {docs.length === 1 ? "folio" : "folios"}
              </p>
            </div>
            <EstadoRequisitoPopover
              estado={estado}
              className={cn(
                estado === "ESCANEADO" && "border-emerald-200 text-emerald-700",
                estado === "EMITIDO" && "border-primary/20 text-primary",
                estado === "PENDIENTE" && "text-muted-foreground",
                estado === "CANCELADO" && "border-red-200 text-red-600",
                estado === "EXCEPCION_LEGACY" && "border-amber-200 bg-amber-50 text-amber-700",
              )}
            />
            {(estado === "PENDIENTE" || estado === "CANCELADO") && (
              <AccionExplicada
                etiqueta={emitiendo ? "Emitiendo…" : `Emitir ${requisito.tipo}`}
                titulo={`Emitir ${requisito.tipo}`}
                descripcion="Crea un folio consecutivo permanente para este tipo documental. El registro quedará en la trazabilidad aunque después sea cancelado."
                confirmar="Emitir folio"
                variant={requisito.exigencia === "segun_aplique" ? "outline" : "default"}
                className="h-8 px-3 text-xs"
                disabled={emitiendo}
                onConfirmar={onEmitir}
              />
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-expanded={expandida}
              aria-label={`${expandida ? "Cerrar" : "Abrir"} ${requisito.tipo}`}
              onClick={() => setAbierta((valor) => !valor)}
              disabled={candado !== null}
            >
              <ChevronDownIcon
                className={cn(
                  "size-4 text-muted-foreground transition-transform duration-200",
                  expandida && "rotate-180",
                )}
              />
            </Button>
          </div>

          <AnimatePresence initial={false}>
            {expandida && (
              <motion.div
                initial={{ height: 0, opacity: 0, y: -4 }}
                animate={{ height: "auto", opacity: 1, y: 0 }}
                exit={{ height: 0, opacity: 0, y: -4 }}
                transition={{ duration: 0.22, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                {candado && (
                  <CalloutCandado candado={candado} onCerrar={onCerrarCandado} />
                )}

                {excepcion && <CalloutExcepcionLegacy excepcion={excepcion} />}

                {!excepcion && solicitudPendiente && (
                  <CalloutSolicitudPendiente solicitud={solicitudPendiente} />
                )}

                {docs.length > 0 ? (
                  <ul className="ml-4 mt-3 space-y-2 border-l border-dashed pl-4">
                    {docs.map((doc, indice) => (
                      <li key={doc.id} className="relative">
                        <span
                          aria-hidden="true"
                          className="absolute -left-4 top-5 h-px w-4 bg-border"
                        />
                        <motion.div
                          layout
                          layoutId={`wallet-documento-${doc.id}`}
                          initial={{
                            opacity: 0,
                            y: -8,
                            rotate: indice % 2 === 0 ? -0.5 : 0.5,
                            scale: 0.99,
                          }}
                          animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -6, scale: 0.99 }}
                          transition={{
                            type: "spring",
                            stiffness: 400,
                            damping: 32,
                            delay: indice * 0.045,
                          }}
                          className={cn(
                            "rounded-xl border bg-background/90 p-3 shadow-xs transition-colors hover:border-primary/20 hover:bg-background",
                            doc.cancelado && "bg-muted/40 opacity-65",
                          )}
                        >
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-mono text-xs font-semibold">{doc.folio}</span>
                            <BotonCopiar texto={doc.folio} />
                            <BadgeDocumento doc={doc} />
                            <span className="text-[11px] text-muted-foreground">
                              {doc.emitido_por_nombre} ·{" "}
                              {format(new Date(doc.emitido_en), "d MMM yyyy", {
                                locale: es,
                              })}
                            </span>
                            {doc.sustituido_por_folio && (
                              <span className="text-[11px] text-muted-foreground">
                                → {doc.sustituido_por_folio}
                              </span>
                            )}
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-1 border-t pt-2">
                            {!doc.cancelado && (
                              <AbrirWizardButton onOpen={() => onCapturar(doc.id)} />
                            )}
                            {!doc.cancelado && !excepcion && (
                              <AccionExplicada
                                etiqueta="Subir escaneo"
                                titulo={`Subir escaneo de ${doc.folio}`}
                                descripcion="Abre el selector para cargar el documento firmado. Al confirmar la carga se crea una versión inmutable y las versiones anteriores permanecen disponibles."
                                confirmar="Elegir archivo"
                                variant="ghost"
                                className="h-7 px-2 text-[11px]"
                                icono={<ScanLineIcon className="size-3" />}
                                onConfirmar={() => onSubir(doc)}
                              />
                            )}
                            {esExcepcionable &&
                              !doc.cancelado &&
                              !doc.escaneado &&
                              !excepcion &&
                              !solicitudPendiente && (
                                <AccionExplicada
                                  etiqueta="Solicitar excepción (legacy)"
                                  titulo={`Solicitar excepción de ${requisito.tipo} por legacy`}
                                  descripcion="Para unidades adquiridas antes del sistema, sin el papel físico de este documento. La solicitud queda pendiente hasta que un administrador (N3) que no seas tú la apruebe o la rechace desde /modo-riesgo."
                                  confirmar="Continuar"
                                  variant="ghost"
                                  className="h-7 px-2 text-[11px] text-amber-700 hover:text-amber-800"
                                  icono={<ShieldAlertIcon className="size-3" />}
                                  onConfirmar={() => onDeclararExcepcion(requisito.tipo)}
                                />
                              )}
                            {doc.version_maxima != null && (
                              <AccionExplicada
                                etiqueta="Ver escaneo"
                                titulo={`Consultar escaneo v${doc.version_maxima}`}
                                descripcion="Abre en una pestaña nueva la versión más reciente resguardada. Esta consulta no modifica el documento ni crea otra versión."
                                confirmar="Abrir escaneo"
                                variant="ghost"
                                className="h-7 px-2 text-[11px]"
                                onConfirmar={() => {
                                  window.open(
                                    `/api/documentos/${doc.id}/escaneos/${doc.version_maxima}`,
                                    "_blank",
                                  );
                                }}
                              />
                            )}
                            {doc.tipo_codigo === "C-02" &&
                              !doc.pago_verificado &&
                              !doc.cancelado && (
                                <AccionExplicada
                                  etiqueta="Verificar pago"
                                  titulo="Verificar pago del C-02"
                                  descripcion="Abre la confirmación de pago. El pago verificado, junto con el escaneo del C-02, habilita la emisión del acta F-11."
                                  confirmar="Revisar pago"
                                  variant="ghost"
                                  className="h-7 px-2 text-[11px]"
                                  onConfirmar={() => onPago(doc)}
                                />
                              )}
                            {!doc.cancelado && (
                              <AccionExplicada
                                etiqueta="Cancelar"
                                titulo={`Cancelar ${doc.folio}`}
                                descripcion="No elimina el folio: lo conserva en la auditoría y deja de admitir operaciones. El siguiente diálogo pedirá el motivo y permitirá emitir un sustituto."
                                confirmar="Revisar cancelación"
                                variant="ghost"
                                className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
                                onConfirmar={() => onCancelar(doc)}
                                peligrosa
                              />
                            )}
                          </div>
                        </motion.div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-dashed bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                    <CircleDashedIcon className="size-3.5 shrink-0" />
                    Aún no hay un folio dentro de este documento.
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </li>
  );
}

function BadgeDocumento({ doc }: { doc: DocumentoDetalle }) {
  const estado: EstadoRequisito = doc.cancelado
    ? "CANCELADO"
    : doc.escaneado
      ? "ESCANEADO"
      : "EMITIDO";
  return (
    <EstadoRequisitoPopover
      estado={estado}
      className={cn(
        "px-2 py-px font-medium normal-case tracking-normal",
        estado === "CANCELADO" && "border-red-200 bg-red-50 text-red-700",
        estado === "ESCANEADO" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        estado === "EMITIDO" && "bg-background text-foreground",
      )}
    >
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
    </EstadoRequisitoPopover>
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
  const [archivos, setArchivos] = useState<File[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState<{ actual: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function agregarArchivos(nuevos: FileList | File[]) {
    const seleccion = Array.from(nuevos);
    if (seleccion.length === 0) return;
    const validos = seleccion.filter((archivo) => {
      if (!MIMES_ACEPTADOS.has(archivo.type)) {
        toast.error(`${archivo.name}: solo se admiten PDF, JPG, PNG o WEBP.`);
        return false;
      }
      if (archivo.size > MAX_BYTES_ESCANEO) {
        toast.error(`${archivo.name}: supera el límite de 25 MB.`);
        return false;
      }
      return true;
    });
    if (validos.length > 0) setArchivos((anteriores) => [...anteriores, ...validos]);
  }

  async function subir() {
    if (archivos.length === 0) return;
    setSubiendo(true);
    setProgreso({ actual: 0, total: archivos.length });
    const pendientes: File[] = [];
    let registrados = 0;
    try {
      for (const [indice, archivo] of archivos.entries()) {
        setProgreso({ actual: indice + 1, total: archivos.length });
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
        if (!presign) {
          pendientes.push(archivo);
          continue;
        }

        const put = await fetch(presign.url, {
          method: "PUT",
          headers: { "Content-Type": archivo.type },
          body: archivo,
        });
        if (!put.ok) {
          toast.error(`${archivo.name}: la subida al almacén falló (${put.status})`);
          pendientes.push(archivo);
          continue;
        }

        const confirmado = await postJson<{ version: number }>(
          `/api/documentos/${doc.id}/escaneos/confirmar`,
          { sha256, rutaObjeto: presign.rutaObjeto, tamanoBytes: archivo.size },
        );
        if (!confirmado) {
          pendientes.push(archivo);
          continue;
        }
        registrados += 1;
      }

      if (registrados > 0) {
        toast.success(
          registrados === 1
            ? `Archivo registrado para ${doc.folio}`
            : `${registrados} archivos registrados para ${doc.folio}`,
        );
      }
      if (pendientes.length === 0) {
        onDone();
      } else {
        setArchivos(pendientes);
      }
    } finally {
      setSubiendo(false);
      setProgreso(null);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Subir escaneo · {doc.folio}</DialogTitle>
          <DialogDescription>
            Adjunta uno o varios archivos del documento firmado. Cada PDF o imagen
            queda resguardado de forma independiente y no reemplaza los anteriores.
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
            agregarArchivos(e.dataTransfer.files);
          }}
          className={cn(
            "flex min-h-32 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-4 text-sm text-muted-foreground transition-colors",
            arrastrando && "border-foreground bg-muted",
          )}
        >
          {archivos.length > 0 ? (
            <>
              <FileCheck2Icon className="mb-1 size-7 text-emerald-600" />
              <span className="font-medium text-foreground">
                {archivos.length === 1 ? archivos[0].name : `${archivos.length} archivos seleccionados`}
              </span>
              <span className="text-xs">Haz clic o arrastra más archivos para agregarlos</span>
            </>
          ) : (
            <>
              <ScanLineIcon className="mb-1 size-7 text-primary" />
              <span>Arrastra PDFs o imágenes aquí</span>
              <span className="text-xs">o haz clic para elegir varios (PDF/JPG/PNG/WEBP, máx. 25 MB c/u)</span>
            </>
          )}
        </button>
        {archivos.length > 0 && (
          <ul className="max-h-32 space-y-1 overflow-y-auto rounded-md border bg-muted/20 p-2 text-xs">
            {archivos.map((archivo, indice) => (
              <li key={`${archivo.name}-${archivo.size}-${indice}`} className="flex items-center justify-between gap-3">
                <span className="truncate text-foreground">{archivo.name}</span>
                <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                  {(archivo.size / 1024 / 1024).toFixed(2)} MB
                  <button
                    type="button"
                    aria-label={`Quitar ${archivo.name}`}
                    className="rounded p-0.5 hover:bg-muted hover:text-foreground"
                    onClick={() =>
                      setArchivos((anteriores) => anteriores.filter((_, i) => i !== indice))
                    }
                  >
                    <XIcon className="size-3" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={TIPOS_ACEPTADOS}
          multiple
          className="hidden"
          onChange={(e) => {
            agregarArchivos(e.target.files ?? []);
            e.currentTarget.value = "";
          }}
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={subiendo}>
            Cancelar
          </Button>
          <Button onClick={subir} disabled={archivos.length === 0 || subiendo}>
            {!subiendo && <ScanLineIcon className="size-4" />}
            {subiendo && progreso
              ? `Subiendo ${progreso.actual} de ${progreso.total}…`
              : archivos.length > 1
                ? `Subir ${archivos.length} archivos`
                : "Subir y registrar"}
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

// Paso 1 del procedimiento de excepción legacy: cualquier usuario autenticado
// solicita, y la solicitud queda PENDIENTE hasta que un N3 distinto de quien
// solicitó la apruebe o la rechace desde /modo-riesgo (traza.decidir_solicitud_riesgo).
// Ya no hace falta un token de modo riesgo previo.
function DialogSolicitarExcepcion({
  expedienteId,
  tipoCodigo,
  nombreTipo,
  onClose,
  onDone,
}: {
  expedienteId: number;
  tipoCodigo: string;
  nombreTipo: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const motivoValido = motivo.trim().length >= 40;

  async function solicitar() {
    setEnviando(true);
    try {
      const res = await postJson<{ solicitudId: number }>(
        `/api/expedientes/${expedienteId}/solicitudes-riesgo`,
        { tipoCodigo, motivo },
      );
      if (!res) return;
      toast.success("Solicitud enviada; un administrador (N3) debe aprobarla");
      onDone();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitar excepción legacy · {tipoCodigo}</DialogTitle>
          <DialogDescription>
            Para unidades legacy (adquiridas antes de existir el sistema) sin el
            papel físico de {nombreTipo}. Esto no declara la excepción todavía:
            queda PENDIENTE hasta que un administrador (N3), que no seas tú, la
            apruebe o la rechace desde /modo-riesgo.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="motivo-excepcion">Motivo</Label>
          <Textarea
            id="motivo-excepcion"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Unidad adquirida en 2017, antes de existir el sistema; no hay checklist físico de inspección que escanear…"
          />
          <p
            className={cn(
              "text-xs",
              motivoValido ? "text-muted-foreground" : "text-amber-700",
            )}
          >
            {motivo.trim().length}/40 caracteres mínimo
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={enviando}>
            Volver
          </Button>
          <Button
            variant="destructive"
            onClick={solicitar}
            disabled={!motivoValido || enviando}
          >
            {enviando ? "Enviando…" : "Enviar solicitud"}
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
