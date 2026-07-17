import Link from "next/link";
import { ArrowRightIcon, BookMarkedIcon } from "lucide-react";

import { BlurFade } from "@/components/ui/blur-fade";
import { CalculosDocumentales } from "./calculos";
import { DescargasFormatos } from "./descargas";
import { MapaDocumental } from "./mapa";

export const dynamic = "force-dynamic";

export default function DocumentacionPage() {
  return (
    <div className="space-y-8">
      <BlurFade delay={0.05}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Documentación
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Mapa documental, cálculos del manual, formatos descargables y los manuales operativos completos,
            todo desde un mismo lugar.
          </p>
        </div>
      </BlurFade>

      <BlurFade delay={0.08}>
        <Link
          href="/manuales"
          className="group flex items-center justify-between gap-4 rounded-xl border bg-background p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
        >
          <div className="flex items-center gap-3">
            <BookMarkedIcon className="size-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">Manuales M-01 / M-02</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Procedimientos, candados, el Anexo A de PLD y jurisprudencia, y las cancelaciones de M-02.
              </p>
            </div>
          </div>
          <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      </BlurFade>

      <BlurFade delay={0.12}>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Mapa documental M-01</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Qué es cada documento, cuál es su madre y qué destraba. Pica un nodo
            para ver su ficha; las flechas animadas marcan el candado de venta.
          </p>
        </div>
        <div className="mt-4">
          <MapaDocumental />
        </div>
      </BlurFade>
      <BlurFade delay={0.18}>
        <CalculosDocumentales />
      </BlurFade>
      <BlurFade delay={0.24}>
        <DescargasFormatos />
      </BlurFade>
    </div>
  );
}
