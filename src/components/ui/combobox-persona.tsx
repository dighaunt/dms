"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Campo de "quién recibe el dinero": se escribe libremente O se elige del
 * catálogo de personas, sin cambiar de modo y sin decidir nada de antemano.
 *
 * POR QUÉ NO ES UN SELECTOR. A veces se le paga a alguien una sola vez en la
 * vida y darlo de alta sería un estorbo; a veces se le paga cada semana al
 * mismo proveedor y reescribir su nombre cincuenta veces al año es lo que hace
 * que "Refaccionaria del Norte" y "Refaccionaria del Nte." acaben siendo dos
 * personas distintas para el sistema y nadie pueda sumar cuánto se le ha
 * pagado. Las dos cosas son legítimas, así que las dos se capturan en el mismo
 * campo: el texto es lo que se firma, el enlace sirve para sumar.
 *
 * POR QUÉ EL TEXTO LIBRE NO SE REGAÑA. Escribir sin elegir es el camino
 * corriente, no un error: por eso al abrir la lista NINGUNA sugerencia queda
 * resaltada. Quien teclea "Refac…" ve lo que hay y puede ignorarlo —Tab, Enter
 * o seguir escribiendo dejan el texto tal cual—; sólo bajando con la flecha se
 * entra a la lista, y sólo entonces Enter elige.
 *
 * POR QUÉ EL ENLACE NO SE ROMPE SOLO. Corregir el nombre después de elegir la
 * ficha no deshace el enlace: el documento guarda el texto que se escribió
 * —eso es lo que la persona firma— y el enlace sigue diciendo a qué ficha se
 * le está sumando ese pago. Se ve en pantalla a cuál, y se quita a mano.
 *
 * Referencias de patrón (Mobbin): folk —"Create person" como último renglón de
 * la búsqueda—, Coursera —la opción de usar lo tecleado conviviendo con las
 * coincidencias—, Confluence y Homerun —lo elegido visible como ficha con su
 * botón para soltarlo—, Notion —el "busca o crea" dicho bajo el campo—.
 */

/** Una ficha del catálogo, tal como se necesita para ofrecerla y copiarla. */
export type PersonaSugerida = {
  id: number;
  nombre: string;
  /** El catálogo admite fichas sin identificación; el vale sí la exige. */
  idTipo: string | null;
  idNumero: string | null;
  categoria?: string | null;
  activa?: boolean;
};

/**
 * Lo capturado en el campo. `nombre` SIEMPRE viaja —es lo que se imprime y se
 * firma— y `personaId` sólo cuando se eligió del catálogo.
 */
export type PersonaCapturada = {
  nombre: string;
  personaId: number | null;
  /** Nombre de la ficha enlazada, para poder decir a quién se le está sumando. */
  fichaNombre: string | null;
};

export const PERSONA_SIN_CAPTURAR: PersonaCapturada = {
  nombre: "",
  personaId: null,
  fichaNombre: null,
};

/** Texto suelto, sin enlace: el caso de a quien se le paga una sola vez. */
export function personaDeTextoLibre(nombre: string): PersonaCapturada {
  return { nombre, personaId: null, fichaNombre: null };
}

type Props = {
  id?: string;
  valor: PersonaCapturada;
  onChange: (valor: PersonaCapturada) => void;
  /**
   * Se llama SÓLO al elegir una ficha, con lo que esa ficha tenga. Sirve para
   * copiar la identificación al formulario; quien la recibe la deja editable,
   * porque el vale exige identificación aunque el catálogo no la tenga.
   */
  onElegirFicha?: (persona: PersonaSugerida) => void;
  /** Sustituible en pruebas o cuando la lista ya está en memoria. */
  buscar?: (texto: string, senal: AbortSignal) => Promise<PersonaSugerida[]>;
  /** Acota la búsqueda del catálogo, p. ej. "PROVEEDOR". */
  categoria?: string;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  className?: string;
};

/** Lo que se ofrece de golpe. Un desplegable no se lee por decenas de renglones. */
const TOPE_SUGERENCIAS = 8;

/** Se espera a que deje de teclear para no consultar en cada pulsación. */
const RETARDO_BUSQUEDA_MS = 220;

/** Fichas del catálogo que coinciden con lo tecleado. */
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

  // Se descarta lo que no traiga id y nombre en vez de romper la captura: el
  // texto libre tiene que seguir sirviendo aunque el catálogo conteste raro.
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
          // Ninguna queda resaltada a propósito: escribir sin elegir es el
          // camino corriente y no debe costar una pulsación de más.
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

  /**
   * Recorre la lista. El -1 no es un hueco: es "ninguna resaltada", el estado
   * en el que Enter deja pasar el texto libre, y por eso se puede volver a él
   * saliendo por cualquiera de los dos extremos.
   */
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
      // Sin sugerencia resaltada no se intercepta nada: lo tecleado ya está
      // capturado y el formulario sigue su curso.
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
        // Corregir el texto NO suelta el enlace: el documento guarda lo que se
        // escribió y el enlace sigue diciendo a qué ficha se le suma el pago.
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
                // El puntero no debe quitarle el foco al campo antes del clic:
                // si lo quitara, la lista se cerraría y el clic caería al aire.
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
