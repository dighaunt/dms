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
