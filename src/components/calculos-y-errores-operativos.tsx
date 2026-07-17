"use client";

import { CircleAlertIcon, RefreshCwIcon, ServerCrashIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { mensajeErrorRespuesta, mensajeErrorSinRespuesta } from "@/lib/cliente-api";
import { cn } from "@/lib/utils";

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
