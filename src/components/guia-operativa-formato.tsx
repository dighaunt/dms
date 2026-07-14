"use client";

import { ClipboardListIcon, ShieldAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { guiaOperativaPara, type GuiaOperativa } from "@/lib/guia-operativa";
import { cn } from "@/lib/utils";

export function GuiaOperativaResumen({ tipo, className }: { tipo: string; className?: string }) {
  const guia = guiaOperativaPara(tipo);
  return (
    <Alert className={cn("mt-4 bg-primary/[0.035]", className)}>
      <ClipboardListIcon className="text-primary" />
      <AlertTitle>Antes de llenar · {guia.etapa}</AlertTitle>
      <AlertDescription>
        <ul className="mt-1.5 space-y-1.5 text-xs leading-relaxed">
          {guia.solicita.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        {guia.perfiles && <PerfilesContraparte perfiles={guia.perfiles} compacto />}
        {guia.alerta && <AlertaOperativa>{guia.alerta}</AlertaOperativa>}
        <div className="mt-3">
          <GuiaOperativaSheet tipo={tipo} compact />
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function GuiaOperativaSheet({ tipo, compact = false }: { tipo: string; compact?: boolean }) {
  const guia = guiaOperativaPara(tipo);
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size={compact ? "xs" : "sm"}>
          <ClipboardListIcon className="size-3.5" />
          {compact ? "Ver guía completa" : "Guía operativa"}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="shrink-0 border-b pr-12">
          <SheetTitle>{tipo} · {guia.etapa}</SheetTitle>
          <SheetDescription>
            Qué pedir, qué cotejar y qué entregar o resguardar antes de cerrar este formato.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
          <ContenidoGuia guia={guia} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ContenidoGuia({ guia }: { guia: GuiaOperativa }) {
  return (
    <div className="space-y-6 pt-5 text-sm leading-relaxed">
      <GuiaLista titulo="Solicita antes de capturar" items={guia.solicita} />
      {guia.perfiles && <PerfilesContraparte perfiles={guia.perfiles} />}
      <GuiaLista titulo="Al cerrar, entrega y resguarda" items={guia.cierra} />
      <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Siempre: llena con la contraparte presente y el original a la vista; anula lo que no aplique, confronta VIN e importes y escanea el tanto del expediente el mismo día.
      </div>
      {guia.alerta && <AlertaOperativa>{guia.alerta}</AlertaOperativa>}
    </div>
  );
}

function GuiaLista({ titulo, items }: { titulo: string; items: string[] }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PerfilesContraparte({
  perfiles,
  compacto = false,
}: {
  perfiles: NonNullable<GuiaOperativa["perfiles"]>;
  compacto?: boolean;
}) {
  return (
    <section className={cn("mt-4", !compacto && "mt-0")}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Según quién firma, pide
      </h3>
      <div className={cn("mt-2 grid gap-2", compacto ? "md:grid-cols-2" : "sm:grid-cols-2")}>
        {perfiles.map((perfil) => (
          <div key={perfil.titulo} className="rounded-lg border bg-background px-3 py-2.5 text-xs leading-relaxed">
            <p className="font-semibold text-foreground">{perfil.titulo}</p>
            <p className="mt-1 text-muted-foreground">{perfil.resumen}</p>
            {perfil.alerta && <AlertaOperativa className="mt-2">{perfil.alerta}</AlertaOperativa>}
          </div>
        ))}
      </div>
    </section>
  );
}

function AlertaOperativa({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("mt-3 flex gap-1.5 rounded-lg bg-amber-100 px-3 py-2 text-xs font-medium leading-relaxed text-amber-950", className)}>
      <ShieldAlertIcon className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
