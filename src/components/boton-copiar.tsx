"use client";

import { useState } from "react";

import { IconoSilk } from "@/components/iconos/silk";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Fallback para contextos sin Clipboard API
    const area = document.createElement("textarea");
    area.value = texto;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

export function BotonCopiar({
  texto,
  etiqueta,
  className,
  variant = "ghost",
}: {
  texto: string;
  /** Si se da, se muestra como botón con texto; si no, es solo el icono. */
  etiqueta?: string;
  className?: string;
  variant?: "ghost" | "outline" | "default";
}) {
  const [copiado, setCopiado] = useState(false);

  async function onClick() {
    if (await copiar(texto)) {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    }
  }

  // La palomita ya es verde en Silk, así que la confirmación no necesita que se
  // la tiña: se lee sola. Lo que se copia aquí —un folio, un VIN— es dato del
  // negocio, y por eso el botón lleva icono a color y no el del mueble.
  const icono = copiado ? "palomita" : "copia";

  return (
    <Button
      type="button"
      variant={variant}
      size={etiqueta ? "sm" : "icon"}
      onClick={onClick}
      aria-label={`Copiar ${texto}`}
      className={cn(!etiqueta && "size-6", className)}
    >
      <IconoSilk nombre={icono} className="shrink-0" />
      {etiqueta && (copiado ? "Copiado" : etiqueta)}
    </Button>
  );
}
