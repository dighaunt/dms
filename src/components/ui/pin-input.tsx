"use client";

import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

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
