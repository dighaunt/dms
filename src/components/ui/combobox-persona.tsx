"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type PersonaSugerida = {
  id: number;
  nombre: string;
  
  idTipo: string | null;
  idNumero: string | null;
  categoria?: string | null;
  activa?: boolean;
};

export type PersonaCapturada = {
  nombre: string;
  personaId: number | null;
  
  fichaNombre: string | null;
};

export const PERSONA_SIN_CAPTURAR: PersonaCapturada = {
  nombre: "",
  personaId: null,
  fichaNombre: null,
};

export function personaDeTextoLibre(nombre: string): PersonaCapturada {
  return { nombre, personaId: null, fichaNombre: null };
}

type Props = {
  id?: string;
  valor: PersonaCapturada;
  onChange: (valor: PersonaCapturada) => void;
  
  onElegirFicha?: (persona: PersonaSugerida) => void;
  
  buscar?: (texto: string, senal: AbortSignal) => Promise<PersonaSugerida[]>;
  
  categoria?: string;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  className?: string;
};

const TOPE_SUGERENCIAS = 8;

const RETARDO_BUSQUEDA_MS = 220;

async function buscarEnCatalogo(
  texto: string,
  senal: AbortSignal,
  categoria?: string,
): Promise<PersonaSugerida[]> {
  const parametros = new URLSearchParams({ limite: String(TOPE_SUGERENCIAS) });
  if (texto !== "") parametros.set("busqueda", texto);
  if (categoria) parametros.set("categoria", categoria);

  const respuesta = await fetch(`/api/finanzas/catalogos/personas?${parametros}`, {
    signal: senal,
  });
  if (!respuesta.ok) throw new Error("No se pudo consultar el catálogo de personas");

  const cuerpo: unknown = await respuesta.json();
  if (!Array.isArray(cuerpo)) return [];

  
  return cuerpo.flatMap((fila): PersonaSugerida[] => {
    if (!fila || typeof fila !== "object") return [];
    const registro = fila as Record<string, unknown>;
    const id = Number(registro.id);
    const nombre = registro.nombre;
    if (!Number.isFinite(id) || typeof nombre !== "string") return [];
    return [
      {
        id,
        nombre,
        idTipo: typeof registro.idTipo === "string" ? registro.idTipo : null,
        idNumero: typeof registro.idNumero === "string" ? registro.idNumero : null,
        categoria: typeof registro.categoria === "string" ? registro.categoria : null,
        activa: typeof registro.activa === "boolean" ? registro.activa : undefined,
      },
    ];
  });
}

export function ComboboxPersona({
  id,
  valor,
  onChange,
  onElegirFicha,
  buscar,
  categoria,
  placeholder = "Escribe el nombre, o búscalo en el catálogo",
  disabled,
  maxLength = 200,
  "aria-invalid": invalido,
  "aria-describedby": describedBy,
  className,
}: Props) {
  const generado = React.useId();
  const idLista = `${id ?? generado}-lista`;
  const idPista = `${id ?? generado}-pista`;

  const contenedor = React.useRef<HTMLDivElement>(null);
  const campo = React.useRef<HTMLInputElement>(null);

  const [abierto, setAbierto] = React.useState(false);
  const [sugerencias, setSugerencias] = React.useState<PersonaSugerida[]>([]);
  const [activa, setActiva] = React.useState(-1);
  const [consultando, setConsultando] = React.useState(false);
  const [falloConsulta, setFalloConsulta] = React.useState(false);

  const enlazada = valor.personaId !== null;
  const textoEditado = enlazada && valor.fichaNombre !== null && valor.nombre !== valor.fichaNombre;

  const consultar = React.useCallback(
    (texto: string, senal: AbortSignal) =>
      buscar ? buscar(texto, senal) : buscarEnCatalogo(texto, senal, categoria),
    [buscar, categoria],
  );

  const texto = valor.nombre;

  React.useEffect(() => {
    if (!abierto || disabled) return;

    const control = new AbortController();
    const temporizador = setTimeout(() => {
      setConsultando(true);
      consultar(texto.trim(), control.signal)
        .then((lista) => {
          if (control.signal.aborted) return;
          setSugerencias(lista.slice(0, TOPE_SUGERENCIAS));
          setFalloConsulta(false);

          setActiva(-1);
        })
        .catch(() => {
          if (control.signal.aborted) return;
          setSugerencias([]);
          setFalloConsulta(true);
        })
        .finally(() => {
          if (!control.signal.aborted) setConsultando(false);
        });
    }, RETARDO_BUSQUEDA_MS);

    return () => {
      clearTimeout(temporizador);
      control.abort();
    };
  }, [abierto, disabled, texto, consultar]);

  function elegir(persona: PersonaSugerida) {
    onChange({ nombre: persona.nombre, personaId: persona.id, fichaNombre: persona.nombre });
    onElegirFicha?.(persona);
    setAbierto(false);
    setActiva(-1);
    campo.current?.focus();
  }

  function soltarEnlace() {
    onChange({ nombre: valor.nombre, personaId: null, fichaNombre: null });
    campo.current?.focus();
  }

  function mover(paso: number) {
    if (sugerencias.length === 0) return;
    setActiva((previa) => {
      const siguiente = previa + paso;
      if (siguiente < -1) return sugerencias.length - 1;
      if (siguiente >= sugerencias.length) return -1;
      return siguiente;
    });
  }

  function alTeclear(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      if (!abierto) setAbierto(true);
      else mover(1);
      return;
    }
    if (evento.key === "ArrowUp") {
      evento.preventDefault();
      if (abierto) mover(-1);
      return;
    }
    if (evento.key === "Enter") {

      if (abierto && activa >= 0 && sugerencias[activa]) {
        evento.preventDefault();
        elegir(sugerencias[activa]);
      }
      return;
    }
    if (evento.key === "Escape") {
      if (abierto) {
        evento.preventDefault();
        setAbierto(false);
        setActiva(-1);
      }
      return;
    }
    if (evento.key === "Tab") {
      setAbierto(false);
      setActiva(-1);
    }
  }

  function alSalir(evento: React.FocusEvent<HTMLDivElement>) {
    if (contenedor.current?.contains(evento.relatedTarget)) return;
    setAbierto(false);
    setActiva(-1);
  }

  const desplegado = abierto && !disabled;
  const hayTexto = texto.trim() !== "";

  return (
    <div ref={contenedor} className={cn("relative", className)} onBlur={alSalir}>
      <Input
        id={id}
        ref={campo}
        role="combobox"
        aria-expanded={desplegado}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={
          desplegado && activa >= 0 ? `${idLista}-opcion-${activa}` : undefined
        }
        aria-describedby={[idPista, describedBy].filter(Boolean).join(" ")}
        aria-invalid={invalido}
        autoComplete="off"
        spellCheck={false}
        value={texto}
        maxLength={maxLength}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => setAbierto(true)}
        onKeyDown={alTeclear}

        onChange={(evento) => {
          onChange({ ...valor, nombre: evento.target.value });
          setAbierto(true);
        }}
      />

      {desplegado && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          <ul id={idLista} role="listbox" aria-label="Personas del catálogo" className="max-h-72 overflow-y-auto p-1">
            {sugerencias.map((persona, indice) => (
              <li
                key={persona.id}
                id={`${idLista}-opcion-${indice}`}
                role="option"
                aria-selected={indice === activa}

                onMouseDown={(evento) => evento.preventDefault()}
                onMouseEnter={() => setActiva(indice)}
                onClick={() => elegir(persona)}
                className={cn(
                  "cursor-pointer rounded-sm px-2 py-1.5 text-sm",
                  indice === activa && "bg-accent text-accent-foreground",
                  persona.activa === false && "opacity-60",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{persona.nombre}</span>
                  {persona.categoria && (
                    <span className="text-xs text-muted-foreground">{persona.categoria}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {persona.idTipo && persona.idNumero
                    ? `${persona.idTipo} ${persona.idNumero}`
                    : "Sin identificación registrada en el catálogo"}
                  {persona.activa === false ? " · dada de baja" : ""}
                </p>
              </li>
            ))}
          </ul>

          <div className="border-t px-2 py-1.5 text-xs text-muted-foreground">
            {consultando
              ? "Buscando en el catálogo…"
              : falloConsulta
                ? "No se pudo consultar el catálogo. Puedes seguir escribiendo el nombre."
                : sugerencias.length === 0
                  ? hayTexto
                    ? `Nadie en el catálogo se llama así. «${texto.trim()}» quedará como texto libre.`
                    : "El catálogo está vacío. Escribe el nombre y quedará como texto libre."
                  : "↓ para entrar a la lista y Enter para elegir. Si sigues escribiendo, queda como texto libre."}
          </div>
        </div>
      )}

      <p id={idPista} className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {enlazada ? (
          <>
            <Badge variant="secondary">Del catálogo</Badge>
            <span className="text-muted-foreground">
              {textoEditado
                ? `Se le sumará a la ficha «${valor.fichaNombre}», aunque el documento diga lo que escribiste.`
                : "Este pago se sumará a su ficha."}
            </span>
            <button
              type="button"
              onClick={soltarEnlace}
              className="underline underline-offset-2 hover:no-underline"
            >
              Quitar el enlace
            </button>
          </>
        ) : hayTexto ? (
          <>
            <Badge variant="outline">Texto libre</Badge>
            <span className="text-muted-foreground">
              No queda enlazado a ninguna ficha; es válido y es lo normal cuando se le paga una
              sola vez.
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">
            Escribe el nombre. Si ya está en el catálogo aparecerá abajo y puedes elegirlo.
          </span>
        )}
      </p>

      <span role="status" aria-live="polite" className="sr-only">
        {desplegado
          ? consultando
            ? "Buscando en el catálogo"
            : `${sugerencias.length} coincidencias en el catálogo`
          : ""}
      </span>
    </div>
  );
}
