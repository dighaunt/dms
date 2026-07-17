import { DownloadIcon, FileTextIcon, ScrollTextIcon } from "lucide-react";

import { FICHAS } from "@/lib/mapa-documental";
import { cn } from "@/lib/utils";

// Biblioteca de descargas: cada formato/contrato del paquete M-01 separado
// como PDF individual (public/formatos/<código>.pdf), listo para imprimir.
export function DescargasFormatos() {
  const grupos = [
    {
      titulo: "Formatos operativos",
      icono: FileTextIcon,
      fichas: FICHAS.filter((f) => f.categoria === "FORMATO"),
    },
    {
      titulo: "Contratos",
      icono: ScrollTextIcon,
      fichas: FICHAS.filter((f) => f.categoria === "CONTRATO"),
    },
  ];

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          Formatos para imprimir
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada documento del paquete M-01 como PDF individual en blanco. Para
          la versión prellenada (folio, expediente y VIN ya impresos), descarga
          el documento desde su expediente al emitir el folio.
        </p>
      </div>
      {grupos.map((grupo) => (
        <div key={grupo.titulo}>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
            <grupo.icono className="size-3.5" />
            {grupo.titulo}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {grupo.fichas.map((ficha) => (
              <li key={ficha.codigo}>
                <a
                  href={`/formatos/${ficha.codigo}.pdf`}
                  download={`${ficha.codigo} ${ficha.nombre}.pdf`}
                  className={cn(
                    "group flex h-full items-center gap-3 rounded-lg border bg-background p-3 shadow-xs",
                    "hover:border-primary/40 hover:bg-accent/50",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-md border font-mono text-[11px] font-bold",
                      ficha.categoria === "CONTRATO"
                        ? "border-amber-300 bg-amber-50 text-amber-800"
                        : "bg-muted",
                    )}
                  >
                    {ficha.codigo}
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-medium leading-snug">
                    {ficha.nombre}
                    <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                      {ficha.etapa} · PDF
                    </span>
                  </span>
                  <DownloadIcon className="size-4 shrink-0 text-muted-foreground/50 group-hover:text-primary" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
