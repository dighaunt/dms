import { cn } from "@/lib/utils";

// Badge discreto estilo WorkOS: punto de color + etiqueta.
export function EstadoBadge({
  etiqueta,
  punto,
  className,
}: {
  etiqueta: string;
  punto: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium text-foreground",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", punto)} aria-hidden />
      {etiqueta}
    </span>
  );
}
