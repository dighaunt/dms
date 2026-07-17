"use client";

import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { MANUALES } from "@/lib/manuales";

export function BuscadorManual() {
  const [consulta, setConsulta] = useState("");
  const resultados = useMemo(() => {
    const termino = consulta.trim().toLocaleLowerCase("es-MX");
    if (termino.length < 2) return [];

    return MANUALES.filter((manual) => {
      const contenido = [
        manual.manual,
        manual.parte,
        manual.titulo,
        manual.descripcion,
        ...manual.secciones.flatMap((seccion) => [
          seccion.titulo,
          ...seccion.parrafos,
          ...(seccion.puntos ?? []),
          ...(seccion.pasos ?? []),
          ...(seccion.tablas ?? []).flatMap((tabla) => [
            tabla.titulo ?? "",
            ...tabla.encabezados,
            ...tabla.filas.flat(),
          ]),
        ]),
      ]
        .join(" ")
        .toLocaleLowerCase("es-MX");
      return contenido.includes(termino);
    }).slice(0, 6);
  }, [consulta]);

  return (
    <div className="relative p-3">
      <label className="sr-only" htmlFor="buscar-manual">
        Buscar en manuales
      </label>
      <div className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-2 shadow-xs">
        <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          id="buscar-manual"
          value={consulta}
          onChange={(event) => setConsulta(event.target.value)}
          placeholder="Buscar en manuales"
          className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          autoComplete="off"
        />
      </div>
      {consulta.trim().length >= 2 && (
        <div className="mt-2 overflow-hidden rounded-md border bg-background shadow-sm">
          {resultados.length > 0 ? (
            resultados.map((manual) => (
              <Link
                key={manual.slug}
                href={`/manuales/${manual.slug}`}
                onClick={() => setConsulta("")}
                className="block border-b px-3 py-2 text-xs last:border-b-0 hover:bg-accent"
              >
                <span className="block font-mono text-[10px] font-semibold text-primary">
                  {manual.manual} · {manual.parte}
                </span>
                <span className="mt-0.5 block font-medium leading-snug">{manual.titulo}</span>
              </Link>
            ))
          ) : (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Sin coincidencias en M-01 o M-02.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
