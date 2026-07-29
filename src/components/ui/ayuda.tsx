import { InfoIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * La "i" que abre una explicación larga en un popover, para no dejarla
 * siempre visible compitiendo con el dato que sí importa de un vistazo. Es
 * mueble de interfaz, no un icono con significado propio: por eso es
 * monocromo (hereda el gris del texto que acompaña) y no un Silk.
 */
export function Ayuda({
  titulo,
  etiqueta,
  children,
  align = "start",
}: {
  titulo?: string;
  /** Texto corto junto al icono, para que el disparador no sea sólo una "i" muda. */
  etiqueta?: string;
  children: ReactNode;
  align?: "start" | "center" | "end";
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex shrink-0 items-center gap-1 text-muted-foreground/70 hover:text-foreground ${etiqueta ? "underline decoration-dotted underline-offset-2" : ""}`}
          aria-label={etiqueta ?? (titulo ? `Ayuda: ${titulo}` : "Ayuda")}
        >
          {etiqueta}
          <InfoIcon className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-80 text-sm">
        {titulo ? (
          <PopoverHeader>
            <PopoverTitle>{titulo}</PopoverTitle>
            <PopoverDescription className="leading-relaxed">{children}</PopoverDescription>
          </PopoverHeader>
        ) : (
          <p className="leading-relaxed text-muted-foreground">{children}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
