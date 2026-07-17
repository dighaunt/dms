"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookMarkedIcon, FileTextIcon, FolderOpenIcon, SearchIcon, XIcon } from "lucide-react";

import { buscarDifuso } from "@/lib/busqueda-difusa";
import type { ResultadoBusqueda } from "@/lib/indice-busqueda";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ICONO_TIPO: Record<ResultadoBusqueda["tipo"], React.ComponentType<{ className?: string }>> = {
  expediente: FolderOpenIcon,
  documento: FileTextIcon,
  manual: BookMarkedIcon,
};

const ETIQUETA_TIPO: Record<ResultadoBusqueda["tipo"], string> = {
  expediente: "Expedientes",
  documento: "Documentación",
  manual: "Manuales",
};

const ORDEN_TIPO: ResultadoBusqueda["tipo"][] = ["expediente", "manual", "documento"];

export function BuscadorGlobal({ indice }: { indice: ResultadoBusqueda[] }) {
  const [consulta, setConsulta] = useState("");

  const resultadosPorTipo = useMemo(() => {
    const resultados = buscarDifuso(indice, consulta, 18);
    const grupos = new Map<ResultadoBusqueda["tipo"], ResultadoBusqueda[]>();
    for (const resultado of resultados) {
      grupos.set(resultado.tipo, [...(grupos.get(resultado.tipo) ?? []), resultado]);
    }
    return ORDEN_TIPO
      .map((tipo) => ({ tipo, resultados: grupos.get(tipo) ?? [] }))
      .filter((grupo) => grupo.resultados.length > 0);
  }, [indice, consulta]);

  const buscando = consulta.trim().length >= 2;
  const sinCoincidencias = buscando && resultadosPorTipo.length === 0;

  return (
    <div>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={consulta}
          onChange={(evento) => setConsulta(evento.target.value)}
          placeholder="Busca un expediente, un VIN, un formato o un tema del manual…"
          aria-label="Buscador global"
          autoComplete="off"
          className="h-14 rounded-2xl border-2 pl-12 pr-12 text-base shadow-sm focus-visible:ring-4"
        />
        {consulta && (
          <button
            type="button"
            onClick={() => setConsulta("")}
            aria-label="Limpiar búsqueda"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <XIcon className="size-4" />
          </button>
        )}
      </div>

      {buscando && (
        <div className="mt-3 space-y-4 rounded-2xl border bg-background p-4 shadow-sm">
          {sinCoincidencias ? (
            <p className="py-2 text-sm text-muted-foreground">
              Sin coincidencias para «{consulta}». Prueba con un VIN, un código (C-02, F-07) o un tema del manual.
            </p>
          ) : (
            resultadosPorTipo.map(({ tipo, resultados }) => {
              const Icono = ICONO_TIPO[tipo];
              return (
                <div key={tipo}>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Icono className="size-3.5" />
                    {ETIQUETA_TIPO[tipo]}
                  </p>
                  <ul className="space-y-1">
                    {resultados.map((resultado) => (
                      <li key={resultado.id}>
                        <Link
                          href={resultado.href}
                          className={cn(
                            "block rounded-lg px-3 py-2 transition-colors hover:bg-accent",
                          )}
                        >
                          <span className="block text-sm font-medium">{resultado.titulo}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {resultado.detalle}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
