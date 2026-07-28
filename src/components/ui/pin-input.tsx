"use client";

import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * PIN de firma en casillas separadas.
 *
 * La forma no es decorativa: es la misma que el papel usa para el VIN y el
 * importe, un carácter por casilla, y por la misma razón — obliga a ir dígito
 * por dígito y hace evidente uno de más o de menos. Además evita el
 * autocompletado del navegador, que en un campo de contraseña ofrecería
 * rellenar el PIN de otra persona.
 *
 * El valor nunca se guarda en ningún lado: vive en el estado del formulario
 * durante los segundos que dura la firma y viaja una sola vez al servidor.
 */
export function PinInput({
  longitud = 6,
  valor,
  onChange,
  disabled,
  "aria-label": etiqueta = "PIN de firma",
}: {
  longitud?: number;
  valor: string;
  onChange: (valor: string) => void;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [foco, setFoco] = useState<number | null>(null);

  const digitos = Array.from({ length: longitud }, (_, i) => valor[i] ?? "");

  function escribir(indice: number, entrada: string) {
    const limpio = entrada.replace(/\D/g, "");
    if (limpio === "") return;

    // Pegar el PIN completo debe funcionar: se reparte desde la casilla actual.
    const siguiente = (valor.slice(0, indice) + limpio + valor.slice(indice + limpio.length))
      .replace(/\D/g, "")
      .slice(0, longitud);
    onChange(siguiente);

    const destino = Math.min(indice + limpio.length, longitud - 1);
    refs.current[destino]?.focus();
  }

  function retroceder(indice: number, tecla: string) {
    if (tecla !== "Backspace") return;
    if (digitos[indice] !== "") {
      onChange(valor.slice(0, indice) + valor.slice(indice + 1));
      return;
    }
    if (indice > 0) {
      onChange(valor.slice(0, indice - 1) + valor.slice(indice));
      refs.current[indice - 1]?.focus();
    }
  }

  return (
    <div className="flex gap-2" role="group" aria-label={etiqueta}>
      {digitos.map((digito, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          // type=password oculta el dígito; inputMode numérico levanta el
          // teclado correcto en la tableta del piso de venta.
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={1}
          disabled={disabled}
          value={digito}
          aria-label={`${etiqueta}, dígito ${i + 1} de ${longitud}`}
          onChange={(e) => escribir(i, e.target.value)}
          onKeyDown={(e) => retroceder(i, e.key)}
          onFocus={() => setFoco(i)}
          onBlur={() => setFoco(null)}
          className={cn(
            "size-11 rounded-md border text-center text-lg font-medium transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-ring",
            foco === i ? "border-ring" : "border-input",
            disabled && "cursor-not-allowed opacity-50",
          )}
        />
      ))}
    </div>
  );
}
