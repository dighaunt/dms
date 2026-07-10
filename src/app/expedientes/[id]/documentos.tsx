"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
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

import { postJson, sha256Hex } from "@/lib/cliente-api";
import type { DocumentoDetalle } from "@/lib/db/consultas";
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

// Juego documental esperado como checklist por etapa (patrón Remote/Pipedrive):
// cada requisito muestra su estado, qué destraba, y la acción directa.
export function JuegoDocumental({
  expedienteId,
  numeroExpediente,
  vin,
  origen,
  documentos,
}: {
  expedienteId: number;
  numeroExpediente: string;
  vin: string;
  origen: "PROPIA" | "CONSIGNADA";
  documentos: DocumentoDetalle[];
}) {
  const router = useRouter();
  const [subirDoc, setSubirDoc] = useState<DocumentoDetalle | null>(null);
  const [cancelarDoc, setCancelarDoc] = useState<DocumentoDetalle | null>(null);
  const [pagoDoc, setPagoDoc] = useState<DocumentoDetalle | null>(null);
  const [folioNuevo, setFolioNuevo] = useState<FolioEmitido | null>(null);
  const [emitiendo, setEmitiendo] = useState<string | null>(null);

  const porTipo = new Map<string, DocumentoDetalle[]>();
  for (const d of documentos) {
    porTipo.set(d.tipo_codigo, [...(porTipo.get(d.tipo_codigo) ?? []), d]);
  }
  const etapas = juegoEsperado(origen);

  async function emitir(tipo: string) {
    setEmitiendo(tipo);
    try {
      const res = await postJson<FolioEmitido>(
        `/api/expedientes/${expedienteId}/documentos`,
        { tipo },
      );
      if (!res) return;
      setFolioNuevo(res);
      router.refresh();
    } finally {
      setEmitiendo(null);
    }
  }

  return (
    <div className="space-y-4">
      {etapas.map((etapa) => {
        const IconoEtapa = ICONO_ETAPA[etapa.codigo] ?? FolderOpenIcon;
        const medibles = etapa.requisitos.filter((r) => r.exigencia !== "segun_aplique");
        const completos = medibles.filter((r) => {
          const e = estadoDe(porTipo.get(r.tipo) ?? []);
          return e === "EMITIDO" || e === "ESCANEADO";
        }).length;

        return (
          <section key={etapa.codigo} className="overflow-hidden rounded-lg border bg-background shadow-xs">
            <header className="flex items-center gap-3 border-b bg-muted/30 px-4 py-3">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                <IconoEtapa className="size-4 text-primary" />
              </div>
              <h3 className="flex-1 text-sm font-medium">{etapa.etiqueta}</h3>
              {medibles.length > 0 && (
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    completos === medibles.length
                      ? "font-medium text-emerald-600"
                      : "text-muted-foreground",
                  )}
                >
                  {completos} de {medibles.length}
                </span>
              )}
            </header>

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
                />
              ))}
            </ul>
          </section>
        );
      })}

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

function FilaRequisito({
  requisito,
  docs,
  emitiendo,
  onEmitir,
  onSubir,
  onCancelar,
  onPago,
}: {
  requisito: RequisitoDocumento;
  docs: DocumentoDetalle[];
  emitiendo: boolean;
  onEmitir: () => void;
  onSubir: (d: DocumentoDetalle) => void;
  onCancelar: (d: DocumentoDetalle) => void;
  onPago: (d: DocumentoDetalle) => void;
}) {
  const estado = estadoDe(docs);
  const { icono: Icono, clase } = ICONO_ESTADO[estado];

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
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
        <span className="text-emerald-600">· pago ✓</span>
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
