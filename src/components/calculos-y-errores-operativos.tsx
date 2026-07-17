"use client";

import {
  CalculatorIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  ListOrderedIcon,
  RefreshCwIcon,
  ServerCrashIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { mensajeErrorRespuesta, mensajeErrorSinRespuesta } from "@/lib/cliente-api";
import { cn } from "@/lib/utils";

export type EntradaCalculo = {
  /** Identificador estable del campo que alimenta la regla. */
  campo: string;
  etiqueta: string;
  valor?: string | number | boolean | null;
  tipo?: "numero" | "texto" | "booleano" | "fecha";
  obligatoria?: boolean;
  /** Permite que el motor comparta validaciones semanticas mas estrictas. */
  valida?: boolean;
  ayuda?: string;
};

export type ResultadoCalculo = {
  etiqueta: string;
  valor?: string | number | null;
  ayuda?: string;
  secundarios?: Array<{
    etiqueta: string;
    valor?: string | number | null;
  }>;
};

export type EstadoReglaCalculo =
  | "pendiente"
  | "lista"
  | "calculada"
  | "bloqueada"
  | "revision";

export type ReglaCalculoOperativa = {
  id: string;
  titulo: string;
  formula: string;
  descripcion?: string;
  entradas: EntradaCalculo[];
  resultado: ResultadoCalculo;
  /**
   * El motor puede fijar un estado cuando una regla de negocio no se deduce
   * solamente de sus entradas, por ejemplo una exencion que requiere firma.
   */
  estado?: EstadoReglaCalculo;
  motivoBloqueo?: string;
};

type ProblemaCampo = {
  name?: unknown;
  label?: unknown;
  message?: unknown;
};

type CuerpoError = {
  missing?: unknown;
};

export type ErrorOperacion = {
  status: number;
  titulo: string;
  mensaje: string;
  siguientePaso: string;
  problemas: Array<{ campo: string; mensaje: string }>;
};

function valorPresente(entrada: EntradaCalculo): boolean {
  if (entrada.valor === null || entrada.valor === undefined) return false;
  if (typeof entrada.valor === "string") return entrada.valor.trim() !== "";
  return true;
}

function numeroValido(entrada: EntradaCalculo): boolean {
  if (entrada.tipo !== "numero" || !valorPresente(entrada)) return true;
  const normalizado = String(entrada.valor).replaceAll(",", "").trim();
  return /^\d+(?:\.\d+)?$/.test(normalizado) && Number.isFinite(Number(normalizado));
}

function estadoDeRegla(regla: ReglaCalculoOperativa): EstadoReglaCalculo {
  if (regla.estado) return regla.estado;
  if (regla.entradas.some((entrada) => entrada.valida === false || !numeroValido(entrada))) {
    return "pendiente";
  }
  if (regla.entradas.some((entrada) => entrada.obligatoria !== false && !valorPresente(entrada))) {
    return "pendiente";
  }
  if (valorPresente({ campo: "resultado", etiqueta: "Resultado", valor: regla.resultado.valor })) {
    return "calculada";
  }
  return "lista";
}

function resumenEntrada(entrada: EntradaCalculo): string {
  if (!valorPresente(entrada)) return "Pendiente";
  if (entrada.valida === false || !numeroValido(entrada)) return "Requiere correccion";
  return "Listo";
}

const ESTADO_REGRA: Record<
  EstadoReglaCalculo,
  { etiqueta: string; className: string; Icono: typeof CircleDashedIcon }
> = {
  pendiente: {
    etiqueta: "Faltan datos previos",
    className: "border-amber-200 bg-amber-50 text-amber-950",
    Icono: CircleAlertIcon,
  },
  lista: {
    etiqueta: "Lista para calcular",
    className: "border-sky-200 bg-sky-50 text-sky-950",
    Icono: CalculatorIcon,
  },
  calculada: {
    etiqueta: "Resultado calculado",
    className: "border-emerald-200 bg-emerald-50 text-emerald-950",
    Icono: CircleCheckIcon,
  },
  bloqueada: {
    etiqueta: "Calculo bloqueado",
    className: "border-red-200 bg-red-50 text-red-950",
    Icono: CircleAlertIcon,
  },
  revision: {
    etiqueta: "Requiere revision",
    className: "border-amber-200 bg-amber-50 text-amber-950",
    Icono: CircleAlertIcon,
  },
};

/**
 * Explica el orden de captura de una regla y presenta su resultado derivado.
 * El calculo real sigue perteneciendo al motor de dominio; este componente no
 * evalua formulas desde texto ni permite que el resultado se capture a mano.
 */
export function PanelReglasCalculo({
  reglas,
  className,
}: {
  reglas: ReglaCalculoOperativa[];
  className?: string;
}) {
  if (reglas.length === 0) return null;

  return (
    <section className={cn("rounded-lg border bg-background", className)} aria-label="Reglas de calculo">
      <div className="flex items-start gap-3 border-b px-4 py-3">
        <CalculatorIcon className="mt-0.5 size-4 shrink-0 text-primary" />
        <div>
          <h3 className="text-sm font-semibold">Calculos del formato</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Captura los datos en el orden indicado. El resultado se genera con la formula aplicable y no debe sustituirse manualmente.
          </p>
        </div>
      </div>

      <div className="divide-y">
        {reglas.map((regla) => {
          const estado = estadoDeRegla(regla);
          const presentacion = ESTADO_REGRA[estado];
          const Icono = presentacion.Icono;
          const pendientes = regla.entradas.filter(
            (entrada) =>
              entrada.valida === false ||
              !numeroValido(entrada) ||
              (entrada.obligatoria !== false && !valorPresente(entrada)),
          );

          return (
            <article key={regla.id} className="px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold">{regla.titulo}</h4>
                  {regla.descripcion && (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{regla.descripcion}</p>
                  )}
                </div>
                <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium", presentacion.className)}>
                  <Icono className="size-3.5" />
                  {presentacion.etiqueta}
                </span>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.8fr)]">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <ListOrderedIcon className="size-3.5 text-primary" />
                    Datos requeridos, en este orden
                  </p>
                  <ol className="mt-2 space-y-2 text-xs">
                    {regla.entradas.map((entrada, index) => {
                      const estadoEntrada = resumenEntrada(entrada);
                      const incorrecta = estadoEntrada === "Requiere correccion";
                      const pendiente = estadoEntrada === "Pendiente";
                      return (
                        <li key={entrada.campo} className="flex items-start gap-2">
                          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold tabular-nums text-muted-foreground">
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="font-medium text-foreground">{entrada.etiqueta}</span>
                            {entrada.ayuda && <span className="block mt-0.5 leading-relaxed text-muted-foreground">{entrada.ayuda}</span>}
                          </span>
                          <span className={cn(
                            "shrink-0 text-[11px] font-medium",
                            incorrecta && "text-red-700",
                            pendiente && "text-amber-700",
                            !incorrecta && !pendiente && "text-emerald-700",
                          )}>
                            {estadoEntrada}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>

                <div className="min-w-0 border-l-0 border-t pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                  <p className="text-xs font-medium text-foreground">Formula aplicada</p>
                  <p className="mt-1 break-words font-mono text-xs leading-relaxed text-muted-foreground">{regla.formula}</p>
                  {estado === "calculada" ? (
                    <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <p className="text-[11px] font-medium text-emerald-950">{regla.resultado.etiqueta}</p>
                      <p className="mt-0.5 break-words text-sm font-semibold tabular-nums text-emerald-950">
                        {String(regla.resultado.valor)}
                      </p>
                      {regla.resultado.ayuda && <p className="mt-1 text-[11px] leading-relaxed text-emerald-900">{regla.resultado.ayuda}</p>}
                      {regla.resultado.secundarios?.map((resultado) => (
                        <div key={resultado.etiqueta} className="mt-2 border-t border-emerald-200 pt-2">
                          <p className="text-[11px] font-medium text-emerald-950">{resultado.etiqueta}</p>
                          <p className="mt-0.5 break-words text-sm font-semibold tabular-nums text-emerald-950">
                            {String(resultado.valor ?? "")}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : estado === "bloqueada" || estado === "revision" ? (
                    <p className="mt-3 text-xs leading-relaxed text-amber-800">
                      {regla.motivoBloqueo ?? "No continúes con este calculo hasta que el responsable revise la regla aplicable."}
                    </p>
                  ) : pendientes.length > 0 ? (
                    <p className="mt-3 text-xs leading-relaxed text-amber-800">
                      Antes de calcular, completa o corrige: {pendientes.map((entrada) => entrada.etiqueta).join(", ")}.
                    </p>
                  ) : (
                    <p className="mt-3 text-xs leading-relaxed text-sky-800">
                      Los datos previos son validos. Guarda para que el sistema ejecute y registre este calculo.
                    </p>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function problemasDeCuerpo(cuerpo: unknown): Array<{ campo: string; mensaje: string }> {
  const missing = cuerpo && typeof cuerpo === "object" ? (cuerpo as CuerpoError).missing : undefined;
  if (!Array.isArray(missing)) return [];
  return missing.flatMap((item: unknown): Array<{ campo: string; mensaje: string }> => {
    if (!item || typeof item !== "object") return [];
    const problema = item as ProblemaCampo;
    const campo = typeof problema.label === "string"
      ? problema.label
      : typeof problema.name === "string"
        ? problema.name
        : "Dato requerido";
    const mensaje = typeof problema.message === "string" && problema.message.trim()
      ? problema.message.trim()
      : "Completa o corrige este dato antes de guardar.";
    return [{ campo, mensaje }];
  });
}

/** Convierte una respuesta HTTP en una instruccion segura y accionable para captura. */
export function errorOperacionDesdeRespuesta(status: number, cuerpo?: unknown): ErrorOperacion {
  const base: Omit<ErrorOperacion, "status" | "mensaje" | "problemas"> = (() => {
    switch (status) {
      case 0:
        return {
          titulo: "No hay conexion con el servicio",
          siguientePaso: "Verifica tu conexion. Conserva esta pantalla abierta y reintenta guardar cuando vuelva el servicio.",
        };
      case 402:
        return {
          titulo: "El servicio externo requiere atencion",
          siguientePaso: "No modifiques el calculo ni generes otro documento. Escala el folio y la hora al administrador para que revise el servicio externo.",
        };
      case 409:
        return {
          titulo: "El estado del expediente impide continuar",
          siguientePaso: "Revisa el estado indicado. No intentes sustituir la evidencia ni crear un documento duplicado.",
        };
      case 422:
        return {
          titulo: "Hay datos que requieren correccion",
          siguientePaso: "Completa los campos marcados y vuelve a guardar. El sistema no calculara un resultado con datos incompletos.",
        };
      case 500:
        return {
          titulo: "El servidor no pudo terminar la operacion",
          siguientePaso: "Reintenta una vez. Si vuelve a ocurrir, conserva la pantalla abierta y escala el folio y la hora; no requiere redeploy desde captura.",
        };
      default:
        if (status >= 500) {
          return {
            titulo: "El servicio no esta disponible temporalmente",
            siguientePaso: "Conserva esta pantalla abierta, reintenta una vez y escala el folio y la hora si el problema continua.",
          };
        }
        return {
          titulo: "No se pudo guardar la operacion",
          siguientePaso: "Revisa el mensaje y los campos indicados antes de volver a intentarlo.",
        };
    }
  })();

  return {
    status,
    ...base,
    mensaje: status === 0 ? mensajeErrorSinRespuesta() : mensajeErrorRespuesta(status, cuerpo),
    problemas: problemasDeCuerpo(cuerpo),
  };
}

/**
 * Aviso persistente para sustituir el toast aislado cuando una operacion no
 * termina. Mantiene visible la causa, los campos que faltan y el siguiente paso.
 */
export function AvisoErrorOperacion({
  error,
  onRetry,
  onDismiss,
  className,
}: {
  error: ErrorOperacion | null;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}) {
  if (!error) return null;

  return (
    <Alert variant="destructive" className={cn("items-start", className)} aria-live="assertive">
      {error.status >= 500 ? <ServerCrashIcon /> : <CircleAlertIcon />}
      <AlertTitle>{error.titulo}</AlertTitle>
      <AlertDescription className="mt-1.5 w-full">
        <p>{error.mensaje}</p>
        <p>{error.siguientePaso}</p>
        {error.problemas.length > 0 && (
          <ul className="mt-2 w-full list-disc space-y-1 pl-4 text-xs">
            {error.problemas.map((problema, index) => (
              <li key={`${problema.campo}-${index}`}>
                <span className="font-medium">{problema.campo}:</span> {problema.mensaje}
              </li>
            ))}
          </ul>
        )}
        {(onRetry || onDismiss) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {onRetry && (
              <Button type="button" size="sm" variant="outline" onClick={onRetry}>
                <RefreshCwIcon className="size-3.5" />
                Reintentar
              </Button>
            )}
            {onDismiss && (
              <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
                Entendido
              </Button>
            )}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
