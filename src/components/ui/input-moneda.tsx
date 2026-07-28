"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { canonizarNumeroCaptura, formatearNumeroCaptura } from "@/lib/numeros";

/**
 * Campo de importe. Se teclea con separador de millares a la vista y se
 * entrega SIEMPRE el decimal canónico, sin comas.
 *
 * POR QUÉ LAS COMAS IMPORTAN AQUÍ. `1250000.00` es un churro de dígitos: para
 * saber si son un millón doscientos cincuenta mil o ciento veinticinco mil hay
 * que contarlos con el dedo, y en estas pantallas equivocarse en un cero es
 * dinero que sale de la caja. Agrupados —`1,250,000.00`— la cifra se lee de un
 * vistazo y el cero de más salta a la cara antes de firmar.
 *
 * EL DINERO NO SE VUELVE `number` NI UN INSTANTE. Todo el módulo trata los
 * importes como cadena y opera en centavos con BigInt (`calculos.ts`), porque
 * numeric(18,2) admite cifras que el punto flotante ya redondea mal. Este
 * componente sólo agrupa texto: `formatearNumeroCaptura` corta la cadena y
 * `canonizarNumeroCaptura` le quita las comas, y ninguno de los dos pasa por
 * Number.
 *
 * EL CARET. Es el defecto clásico de este patrón: al insertar una coma el
 * cursor salta al final y corregir un dígito en medio de la cifra se vuelve
 * imposible. Aquí, después de reformatear, el cursor se recoloca contando
 * cuántos caracteres SIGNIFICATIVOS —los que no son separadores— quedaban a su
 * izquierda, así que se queda pegado al mismo dígito aunque el reformateo haya
 * metido o quitado comas antes de él.
 *
 * Lo tecleado que no puede ser un importe —letras, signos, un tercer decimal—
 * se rechaza antes de que el estado del formulario cambie: `canonizar` devuelve
 * null y la pulsación simplemente no ocurre.
 */

type Props = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  /** Decimal canónico, sin comas. Es lo que se guarda y lo que se envía. */
  valor: string;
  /** Recibe el decimal canónico, nunca lo que se ve en pantalla. */
  onValorChange: (valor: string) => void;
};

/**
 * Dónde queda el cursor después de reformatear.
 *
 * Se cuenta por caracteres significativos y no por índices: entre `1250` y
 * `1,250` los índices se corren, pero "tres dígitos a mi izquierda" sigue
 * señalando al mismo dígito.
 */
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

    // Lo que no puede ser un importe no llega al formulario. Se devuelve al
    // campo lo que había y el cursor se queda donde estaba, para que rechazar
    // una tecla no obligue a buscar el sitio otra vez.
    if (canonico === null) {
      campo.value = mostrado;
      const destino = Math.max(0, caret - 1);
      campo.setSelectionRange(destino, destino);
      return;
    }

    const nuevoTexto = formatearNumeroCaptura(canonico);
    const destino = posicionTrasFormatear(tecleado, caret, nuevoTexto);

    // Se escribe en el DOM ANTES de avisar al formulario: si el canónico no
    // cambió —teclear una coma, por ejemplo— React no volvería a pintar y el
    // campo se quedaría con el texto suelto que acaba de teclearse.
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
