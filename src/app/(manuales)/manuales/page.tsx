import Link from "next/link";
import { ArrowRightIcon, BookOpenIcon, FileCheck2Icon, FileWarningIcon, SearchIcon } from "lucide-react";
import { Callout } from "fumadocs-ui/components/callout";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";

export const dynamic = "force-dynamic";

export default function ManualesPage() {
  return (
    <DocsPage full tableOfContent={{ enabled: false }} footer={{ enabled: false }} breadcrumb={{ enabled: false }}>
      <DocsTitle>Manuales operativos</DocsTitle>
      <DocsDescription>
        Consulta M-01 y su anexo M-02 por tema. Cada página indica la fuente para que la regla se lea con el contrato y el expediente, no como una respuesta aislada.
      </DocsDescription>
      <DocsBody className="max-w-none">
        <Callout type="info" title="Antes de capturar o cerrar">
          Busca la regla, confirma el documento firmado y reúne los datos fuente en el orden indicado. Si la causa, evidencia o autorización no está clara, conserva el pendiente y escala antes de registrar un importe o una cancelación.
        </Callout>

        <div className="not-prose grid gap-3 sm:grid-cols-2">
          <Link
            href="/manuales/m01-manual-operativo"
            className="group border bg-background p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
          >
            <BookOpenIcon className="size-5 text-primary" />
            <p className="mt-4 font-mono text-[11px] font-semibold text-primary">M-01 · Libro de consulta</p>
            <h2 className="mt-1 text-base font-semibold">Operación, documentos y cálculos</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Del ingreso de la unidad a la entrega, con sus candados documentales y fórmulas fuente.</p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">Abrir M-01 <ArrowRightIcon className="size-3.5" /></span>
          </Link>
          <Link
            href="/manuales/m02-alcance-y-uso"
            className="group border bg-background p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
          >
            <FileCheck2Icon className="size-5 text-primary" />
            <p className="mt-4 font-mono text-[11px] font-semibold text-primary">M-02 · Anexo operativo</p>
            <h2 className="mt-1 text-base font-semibold">Cancelaciones y desistimientos</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Causas, procedimiento, casos borde y propuestas que requieren validación antes de operar.</p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">Abrir M-02 <ArrowRightIcon className="size-3.5" /></span>
          </Link>
          <Link
            href="/manuales/m01a-endosos-cierre-y-entrega"
            className="group border bg-background p-4 transition-colors hover:border-primary/40 hover:bg-accent/40 sm:col-span-2"
          >
            <FileWarningIcon className="size-5 text-amber-600" />
            <p className="mt-4 font-mono text-[11px] font-semibold text-primary">M-01 · Anexo A (Rev. 3.1, borrador)</p>
            <h2 className="mt-1 text-base font-semibold">Procedimientos complementarios</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Cierre de endosos y estatus jurídico ante la SCJN, casos borde por datos faltantes, operaciones legales específicas, protocolo ampliado de adeudos, eficiencias legítimas y su línea roja, y jurisprudencia de respaldo. Borrador: las secciones C, D y E están pendientes de validación por el abogado y el contador del lote.</p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">Abrir el Anexo A <ArrowRightIcon className="size-3.5" /></span>
          </Link>
        </div>

        <section className="not-prose mt-10">
          <div className="flex items-center gap-2">
            <SearchIcon className="size-4 text-primary" />
            <h2 className="text-lg font-semibold">Lectura guiada</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            El índice lateral agrupa todas las partes de ambos manuales. El buscador encuentra conceptos dentro de las reglas y abre su página; en móvil, el índice aparece en el encabezado de manuales.
          </p>
        </section>
      </DocsBody>
    </DocsPage>
  );
}
