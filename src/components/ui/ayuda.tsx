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

export function Ayuda({
  titulo,
  etiqueta,
  children,
  align = "start",
}: {
  titulo?: string;
  
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
