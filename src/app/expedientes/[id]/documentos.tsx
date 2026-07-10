"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

import { postJson, sha256Hex } from "@/lib/cliente-api";
import type { DocumentoDetalle } from "@/lib/db/consultas";
import { cn } from "@/lib/utils";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const TIPOS_ACEPTADOS = "application/pdf,image/jpeg,image/png,image/webp";

function BadgeDocumento({ doc }: { doc: DocumentoDetalle }) {
  const estado = doc.cancelado ? "CANCELADO" : doc.escaneado ? "ESCANEADO" : "EMITIDO";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        estado === "CANCELADO" && "border-red-200 bg-red-50 text-red-700",
        estado === "ESCANEADO" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        estado === "EMITIDO" && "bg-background text-foreground",
      )}
    >
      {estado}
      {estado === "ESCANEADO" && doc.version_maxima != null && doc.version_maxima > 1 && (
        <span className="text-[10px] text-emerald-600">v{doc.version_maxima}</span>
      )}
    </span>
  );
}

export function TablaDocumentos({ documentos }: { documentos: DocumentoDetalle[] }) {
  const router = useRouter();
  const [subirDoc, setSubirDoc] = useState<DocumentoDetalle | null>(null);
  const [cancelarDoc, setCancelarDoc] = useState<DocumentoDetalle | null>(null);
  const [pagoDoc, setPagoDoc] = useState<DocumentoDetalle | null>(null);

  return (
    <section className="space-y-3">
      <div className="overflow-hidden rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Folio</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Rev</TableHead>
              <TableHead>Emitido</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documentos.map((doc) => (
              <TableRow key={doc.id} className={cn(doc.cancelado && "opacity-70")}>
                <TableCell className="font-mono text-xs font-medium">
                  {doc.folio}
                  {doc.sustituido_por_folio && (
                    <p className="mt-0.5 text-[10px] font-normal text-muted-foreground">
                      sustituido por {doc.sustituido_por_folio}
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-sm">{doc.nombre_tipo}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {doc.tipo_codigo}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{doc.revision}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {doc.emitido_por_nombre}
                  <br />
                  {format(new Date(doc.emitido_en), "d MMM yyyy, HH:mm", { locale: es })}
                </TableCell>
                <TableCell>
                  <BadgeDocumento doc={doc} />
                  {doc.tipo_codigo === "C-02" && doc.pago_verificado && (
                    <span className="ml-1.5 text-[10px] font-medium text-emerald-700">
                      pago ✓
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {!doc.cancelado && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setSubirDoc(doc)}
                      >
                        Subir escaneo
                      </Button>
                    )}
                    {doc.version_maxima != null && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
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
                        className="h-7 px-2 text-xs"
                        onClick={() => setPagoDoc(doc)}
                      >
                        Verificar pago
                      </Button>
                    )}
                    {!doc.cancelado && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                        onClick={() => setCancelarDoc(doc)}
                      >
                        Cancelar
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

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
          onDone={() => {
            setCancelarDoc(null);
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
    </section>
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
  onDone: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [sustituir, setSustituir] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function cancelar() {
    setEnviando(true);
    try {
      const res = await postJson<{ sustituto: { folio: string } | null }>(
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
      onDone();
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
