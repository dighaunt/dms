"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { canonizarNumeroCaptura, formatearNumeroCaptura } from "@/lib/numeros";

type Props = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  
  valor: string;
  
  onValorChange: (valor: string) => void;
};

export function posicionTrasFormatear(
  crudo: string,
  caret: number,
  formateado: string,
): number {
  const significativos = crudo.slice(0, caret).replace(/,/g, "").length;
  if (significativos === 0) return 0;

  let vistos = 0;
  for (let indice = 0; indice < formateado.length; indice += 1) {
    if (formateado[indice] !== ",") vistos += 1;
    if (vistos === significativos) return indice + 1;
  }
  return formateado.length;
}

export function InputMoneda({ valor, onValorChange, className, ...resto }: Props) {
  const mostrado = formatearNumeroCaptura(valor);

  function alCambiar(evento: React.ChangeEvent<HTMLInputElement>) {
    const campo = evento.currentTarget;
    const tecleado = campo.value;
    const caret = campo.selectionStart ?? tecleado.length;
    const canonico = canonizarNumeroCaptura(tecleado);

    
    
    if (canonico === null) {
      campo.value = mostrado;
      const destino = Math.max(0, caret - 1);
      campo.setSelectionRange(destino, destino);
      return;
    }

    const nuevoTexto = formatearNumeroCaptura(canonico);
    const destino = posicionTrasFormatear(tecleado, caret, nuevoTexto);

    
    
    campo.value = nuevoTexto;
    campo.setSelectionRange(destino, destino);
    onValorChange(canonico);
  }

  return (
    <Input
      {...resto}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={mostrado}
      onChange={alCambiar}
      className={className}
    />
  );
}
