"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CircleDashedIcon,
  EyeIcon,
  FileCheck2Icon,
  ScanLineIcon,
  ShieldIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  anexosDeOrigen,
  ETIQUETA_EXIGENCIA,
  type FichaAnexo,
} from "@/lib/anexos";
import { postJson, sha256Hex } from "@/lib/cliente-api";
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

const TIPOS_ACEPTADOS = "application/pdf,image/jpeg,image/png";

export type AnexoCargado = {
  clave: string;
  version_maxima: number;
  subido_por_nombre: string;
};

// Checklist de anexos del expediente: lo que el checklist maestro (F-06)
// pide resguardar escaneado. Los delicados se consultan con marca de agua.
export function AnexosExpediente({
  expedienteId,
  origen,
  anexos,
}: {
  expedienteId: number;
  origen: "PROPIA" | "CONSIGNADA";
  anexos: AnexoCargado[];
}) {
  const [subiendo, setSubiendo] = useState<FichaAnexo | null>(null);
  const porClave = new Map(anexos.map((a) => [a.clave, a]));
  const fichas = anexosDeOrigen(origen);
  const obligatorios = fichas.filter((f) => f.exigencia[origen] === "OBLIGATORIO");
  const cargadosObligatorios = obligatorios.filter((f) => porClave.has(f.clave)).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Anexos del expediente</h2>
        <span
          className={cn(
            "text-xs tabular-nums",
            cargadosObligatorios === obligatorios.length
              ? "font-medium text-emerald-600"
              : "text-muted-foreground",
          )}
        >
          {cargadosObligatorios} de {obligatorios.length} obligatorios
        </span>
      </div>
      <div className="rounded-lg border bg-background shadow-xs">
        <ul className="divide-y">
          {fichas.map((ficha) => {
            const cargado = porClave.get(ficha.clave);
            const exigencia = ficha.exigencia[origen]!;
            return (
              <li
                key={ficha.clave}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
              >
                {cargado ? (
                  <FileCheck2Icon className="size-4 shrink-0 text-emerald-600" />
                ) : (
                  <CircleDashedIcon
                    className={cn(
                      "size-4 shrink-0",
                      exigencia === "OBLIGATORIO"
                        ? "text-amber-500"
                        : "text-muted-foreground/60",
                    )}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {ficha.nombre}
                    <span
                      className={cn(
                        "ml-2 rounded-full border px-2 py-px text-[10px] font-medium",
                        exigencia === "OBLIGATORIO"
                          ? "border-amber-300 bg-amber-50 text-amber-800"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {ETIQUETA_EXIGENCIA[exigencia]}
                    </span>
                    {ficha.sensible && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <ShieldIcon className="size-3" />
                        consulta con marca de agua
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{ficha.descripcion}</p>
                </div>
                {cargado && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() =>
                      window.open(
                        `/api/expedientes/${expedienteId}/anexos/${ficha.clave}/${cargado.version_maxima}`,
                        "_blank",
                      )
                    }
                  >
                    <EyeIcon className="size-3.5" />
                    Consultar
                    {cargado.version_maxima > 1 ? ` v${cargado.version_maxima}` : ""}
                  </Button>
                )}
                <Button
                  variant={cargado ? "ghost" : "outline"}
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => setSubiendo(ficha)}
                >
                  <ScanLineIcon className="size-3.5" />
                  {cargado ? "Reemplazar" : "Subir escaneo"}
                </Button>
              </li>
            );
          })}
        </ul>
      </div>

      {subiendo && (
        <DialogSubirAnexo
          expedienteId={expedienteId}
          ficha={subiendo}
          onClose={() => setSubiendo(null)}
        />
      )}
    </div>
  );
}

// Dropzone → presign → PUT al store privado → sha256 → confirmar.
function DialogSubirAnexo({
  expedienteId,
  ficha,
  onClose,
}: {
  expedienteId: number;
  ficha: FichaAnexo;
  onClose: () => void;
}) {
  const router = useRouter();
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
        `/api/expedientes/${expedienteId}/anexos/presign`,
        {
          clave: ficha.clave,
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
        toast.error(`La subida al almacén falló (${put.status})`);
        return;
      }

      const confirmado = await postJson<{ version: number }>(
        `/api/expedientes/${expedienteId}/anexos`,
        {
          clave: ficha.clave,
          sha256,
          rutaObjeto: presign.rutaObjeto,
          contentType: archivo.type,
          tamanoBytes: archivo.size,
        },
      );
      if (!confirmado) return;

      toast.success(`${ficha.nombre} v${confirmado.version} en resguardo`);
      onClose();
      router.refresh();
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Subir anexo · {ficha.nombre}</DialogTitle>
          <DialogDescription>
            {ficha.descripcion} Re-subir crea una versión nueva; nunca se edita
            la anterior.
            {ficha.sensible &&
              " Documento delicado: la consulta lleva marca de agua, el archivo se resguarda íntegro."}
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
              <FileCheck2Icon className="mb-1 size-7 text-emerald-600" />
              <span className="font-medium text-foreground">{archivo.name}</span>
              <span className="text-xs">
                {(archivo.size / 1024 / 1024).toFixed(2)} MB
              </span>
            </>
          ) : (
            <>
              <ScanLineIcon className="mb-1 size-7 text-primary" />
              <span>Arrastra el PDF o imagen aquí</span>
              <span className="text-xs">o haz clic para elegir (PDF/JPG/PNG, máx. 25 MB)</span>
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
            {!subiendo && <ScanLineIcon className="size-4" />}
            {subiendo ? "Subiendo…" : "Subir y resguardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
