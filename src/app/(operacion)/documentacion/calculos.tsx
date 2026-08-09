import { configuracionCalculoPena } from "@/lib/calculos/pena-convencional";
import { IconoSilk } from "@/components/iconos/silk";

export function CalculosDocumentales() {
  const c01 = configuracionCalculoPena("C-01");
  if (!c01) return null;

  return (
    <section className="border-t pt-8" aria-labelledby="calculos-documentales">
      <div className="max-w-3xl">
        {}
        <div className="flex items-center gap-2">
          <IconoSilk nombre="peso" className="shrink-0" />
          <h2 id="calculos-documentales" className="text-lg font-semibold tracking-tight">
            Cálculos automáticos
          </h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Reglas documentales que resuelve el motor de datos. No forman parte de la captura manual.
        </p>
      </div>

      <article className="mt-5 grid overflow-hidden rounded-lg border bg-background lg:grid-cols-[1.1fr_0.9fr]">
        <div className="p-5">
          <p className="font-mono text-xs font-bold text-primary">C-01</p>
          <h3 className="mt-1 text-base font-semibold">Pena por desistimiento del apartado</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            El capturista registra primero el monto del apartado y después el precio total pactado. El porcentaje contractual se inserta automáticamente: {c01.porcentajeFijo}%.
          </p>
          <ol className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <li className="flex gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold">1</span>
              <span><span className="font-medium">Monto del apartado (A)</span><span className="block text-xs text-muted-foreground">Dato fuente</span></span>
            </li>
            <li className="flex gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold">2</span>
              <span><span className="font-medium">Precio total pactado (OP)</span><span className="block text-xs text-muted-foreground">Límite contractual</span></span>
            </li>
          </ol>
        </div>
        <div className="border-t bg-muted/25 p-5 lg:border-t-0 lg:border-l">
          <p className="text-xs font-medium text-muted-foreground">Fórmula aplicada</p>
          <p className="mt-2 font-mono text-sm">{c01.formula.replace("p", c01.porcentajeFijo)}</p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            P es la pena y R es el monto a devolver: R = A - P. La pena nunca supera OP.
          </p>
          <div className="mt-4 grid gap-2 text-xs text-muted-foreground">
            <p className="flex gap-2"><IconoSilk nombre="baseDatos" tamano={14} className="mt-0.5 shrink-0" />Al guardar, Neon calcula y registra el resultado con los dos importes fuente.</p>
            <p className="flex gap-2"><IconoSilk nombre="hojaOk" tamano={14} className="mt-0.5 shrink-0" />El PDF recibe el porcentaje calculado; no hay un campo editable para sustituirlo.</p>
          </div>
        </div>
      </article>
    </section>
  );
}
