"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { defineStepper } from "@stepperize/react";
import {
  CarIcon,
  CheckIcon,
  ClipboardCheckIcon,
  HandshakeIcon,
  ScanBarcodeIcon,
} from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { NOMBRE_TIPO } from "@/lib/juego-documental";
import { BlurFade } from "@/components/ui/blur-fade";
import { BotonCopiar } from "@/components/boton-copiar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

const esquema = z.object({
  vin: z
    .string()
    .transform((v) => v.toUpperCase().trim())
    .pipe(
      z
        .string()
        .length(17, "El VIN tiene exactamente 17 caracteres")
        .regex(VIN_REGEX, "Solo mayúsculas y dígitos; I, O y Q no existen en un VIN"),
    ),
  marcaNombre: z.string().trim().min(1, "Requerido"),
  modeloNombre: z.string().trim().min(1, "Requerido"),
  anioModelo: z.coerce.number<string | number>().int().min(1980, "Desde 1980").max(2100),
  color: z.string().trim().optional(),
  numMotor: z.string().trim().optional(),
  kilometraje: z
    .string()
    .trim()
    .regex(/^\d*$/, "Solo números, sin comas")
    .optional(),
  origen: z.enum(["PROPIA", "CONSIGNADA"], { error: "Elige el origen" }),
});

type Valores = z.input<typeof esquema>;

// Onboarding por pasos (@stepperize/react): un dato a la vez, sin fricción.
const { useStepper, steps } = defineStepper([
  { id: "vin", titulo: "VIN", icono: ScanBarcodeIcon },
  { id: "unidad", titulo: "Unidad", icono: CarIcon },
  { id: "origen", titulo: "Origen", icono: HandshakeIcon },
  { id: "confirmar", titulo: "Confirmar", icono: ClipboardCheckIcon },
] as const);

const CAMPOS_POR_PASO: Record<string, (keyof Valores)[]> = {
  vin: ["vin"],
  unidad: ["marcaNombre", "modeloNombre", "anioModelo", "color", "numMotor", "kilometraje"],
  origen: ["origen"],
  confirmar: [],
};

type FolioEmitido = { documentoId: number; tipo: string; revision: string; folio: string };
type Resultado = {
  expediente: { id: number; numeroExpediente: string; vin: string; origen: string };
  folios: FolioEmitido[];
};

export default function NuevoExpedientePage() {
  const stepper = useStepper();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, setEnviando] = useState(false);

  const form = useForm<Valores, unknown, z.output<typeof esquema>>({
    resolver: zodResolver(esquema),
    mode: "onChange",
    defaultValues: {
      vin: "",
      marcaNombre: "",
      modeloNombre: "",
      anioModelo: new Date().getFullYear() - 5,
      color: "",
      numMotor: "",
      kilometraje: "",
      origen: undefined,
    },
  });

  const indiceActual = steps.findIndex((s) => s.id === stepper.current.id);

  async function continuar() {
    const campos = CAMPOS_POR_PASO[stepper.current.id];
    if (campos.length > 0 && !(await form.trigger(campos))) return;
    await stepper.next();
  }

  async function abrirExpediente(valores: z.output<typeof esquema>) {
    setEnviando(true);
    try {
      const res = await fetch("/api/expedientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...valores,
          color: valores.color || undefined,
          numMotor: valores.numMotor || undefined,
          kilometraje: valores.kilometraje ? Number(valores.kilometraje) : undefined,
        }),
      });
      const cuerpo = await res.json();
      if (!res.ok) {
        toast.error(cuerpo.error ?? "No se pudo abrir el expediente", {
          description: cuerpo.detalle,
        });
        return;
      }
      setResultado(cuerpo);
    } finally {
      setEnviando(false);
    }
  }

  if (resultado) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/expedientes" className="text-primary hover:underline">
              Expedientes
            </Link>{" "}
            / Nuevo
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Expediente{" "}
            <span className="font-mono">{resultado.expediente.numeroExpediente}</span>{" "}
            abierto
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            VIN <span className="font-mono">{resultado.expediente.vin}</span> ·
            juego día 0 generado. Anota cada folio{" "}
            <strong className="text-foreground">tal cual</strong> en el
            encabezado de su formato físico:
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border bg-background">
          {resultado.folios.map((f, i) => (
            <BlurFade key={f.documentoId} delay={0.1 + i * 0.08}>
              <div className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 font-mono text-sm font-medium">
                    {f.folio}
                    <BotonCopiar texto={f.folio} />
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {NOMBRE_TIPO[f.tipo] ?? f.tipo} · Rev {f.revision}
                  </p>
                </div>
                <span className="rounded-full border px-2.5 py-0.5 text-xs font-medium">
                  EMITIDO
                </span>
              </div>
            </BlurFade>
          ))}
        </div>

        <div className="flex gap-3">
          <Button asChild>
            <Link href={`/expedientes/${resultado.expediente.id}`}>Ir al expediente</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/expedientes">Volver al listado</Link>
          </Button>
        </div>
      </div>
    );
  }

  const valores = form.watch();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* Indicador de pasos estilo onboarding */}
      <BlurFade delay={0.05}>
        <ol className="flex items-center justify-center">
          {steps.map((paso, i) => {
            const Icono = paso.icono;
            const hecho = i < indiceActual;
            const actual = i === indiceActual;
            return (
              <li key={paso.id} className="flex items-center">
                {i > 0 && (
                  <div
                    className={cn("h-px w-10 sm:w-16", hecho || actual ? "bg-primary" : "bg-border")}
                  />
                )}
                <div className="flex flex-col items-center gap-1 px-1">
                  <div
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full border-2 transition-colors",
                      actual && "border-primary bg-primary text-primary-foreground",
                      hecho && "border-primary bg-background text-primary",
                      !actual && !hecho && "border-border bg-background text-muted-foreground",
                    )}
                  >
                    {hecho ? <CheckIcon className="size-4" /> : <Icono className="size-4" />}
                  </div>
                  <span
                    className={cn(
                      "text-[11px]",
                      actual ? "font-medium text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {paso.titulo}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </BlurFade>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(abrirExpediente)}>
          <BlurFade key={stepper.current.id} delay={0.05}>
            <Card>
              <CardContent className="pt-6">
                {stepper.match({
                  vin: () => (
                    <div className="space-y-4">
                      <div>
                        <h1 className="text-xl font-semibold tracking-tight">
                          Número de serie (VIN)
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Identifica el expediente de forma única: un expediente =
                          un VIN = un folio. Está en la base del parabrisas o en la
                          puerta del conductor.
                        </p>
                      </div>
                      <FormField
                        control={form.control}
                        name="vin"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                                maxLength={17}
                                placeholder="3N1CN7AD4KL812345"
                                className="h-12 font-mono text-lg uppercase tracking-wide"
                                autoComplete="off"
                                autoFocus
                              />
                            </FormControl>
                            <FormDescription>
                              {(field.value ?? "").length}/17 caracteres · sin I, O ni Q
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  ),
                  unidad: () => (
                    <div className="space-y-4">
                      <div>
                        <h1 className="text-xl font-semibold tracking-tight">
                          Datos de la unidad
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Tal como aparecen en la factura.
                        </p>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                          control={form.control}
                          name="marcaNombre"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Marca</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Nissan" autoFocus />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="modeloNombre"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Modelo</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Versa" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="anioModelo"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Año modelo</FormLabel>
                              <FormControl>
                                <Input {...field} type="number" min={1980} max={2100} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="color"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Color (opcional)</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Gris plata" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="numMotor"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>N° de motor (opcional)</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="HR16-123456" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="kilometraje"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Kilometraje al ingreso (opcional)</FormLabel>
                              <FormControl>
                                <Input {...field} inputMode="numeric" placeholder="85000" />
                              </FormControl>
                              <FormDescription>
                                Estos datos prellenan los formatos y contratos del expediente.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  ),
                  origen: () => (
                    <div className="space-y-4">
                      <div>
                        <h1 className="text-xl font-semibold tracking-tight">
                          ¿Cómo llega la unidad?
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Define el contrato fuente del expediente; no se puede
                          cambiar después.
                        </p>
                      </div>
                      <FormField
                        control={form.control}
                        name="origen"
                        render={({ field }) => (
                          <FormItem>
                            <div className="grid gap-4 sm:grid-cols-2">
                              {[
                                {
                                  valor: "PROPIA",
                                  titulo: "Propia",
                                  icono: CarIcon,
                                  detalle: "El lote la compra · contrato fuente C-03",
                                },
                                {
                                  valor: "CONSIGNADA",
                                  titulo: "Consignada",
                                  icono: HandshakeIcon,
                                  detalle: "Un consignante la entrega · contrato fuente C-04",
                                },
                              ].map((op) => {
                                const Icono = op.icono;
                                const activa = field.value === op.valor;
                                return (
                                  <button
                                    key={op.valor}
                                    type="button"
                                    onClick={() => field.onChange(op.valor)}
                                    className={cn(
                                      "flex flex-col items-center gap-2 rounded-xl border-2 p-6 text-center transition-colors",
                                      activa
                                        ? "border-primary bg-primary/5"
                                        : "border-border hover:border-primary/40",
                                    )}
                                  >
                                    <Icono
                                      className={cn(
                                        "size-8",
                                        activa ? "text-primary" : "text-muted-foreground",
                                      )}
                                    />
                                    <span className="text-sm font-semibold">{op.titulo}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {op.detalle}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  ),
                  confirmar: () => (
                    <div className="space-y-4">
                      <div>
                        <h1 className="text-xl font-semibold tracking-tight">
                          Confirmar apertura
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Al confirmar se genera el número de expediente y el juego
                          día 0: contrato fuente ({valores.origen === "PROPIA" ? "C-03" : "C-04"}),
                          F-03, F-05 y F-06.
                        </p>
                      </div>
                      <dl className="divide-y rounded-lg border">
                        {[
                          ["VIN", <span key="v" className="font-mono">{valores.vin}</span>],
                          ["Unidad", `${valores.marcaNombre} ${valores.modeloNombre} · ${valores.anioModelo}`],
                          ["Color", valores.color || "—"],
                          ["N° de motor", valores.numMotor || "—"],
                          ["Kilometraje", valores.kilometraje ? `${Number(valores.kilometraje).toLocaleString("es-MX")} km` : "—"],
                          ["Origen", valores.origen === "PROPIA" ? "Propia (C-03)" : "Consignada (C-04)"],
                        ].map(([k, v]) => (
                          <div key={k as string} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                            <dt className="text-muted-foreground">{k}</dt>
                            <dd className="text-right font-medium">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ),
                })}

                <div className="mt-6 flex items-center justify-between">
                  {stepper.isFirst ? (
                    <Button variant="ghost" type="button" asChild>
                      <Link href="/expedientes">Cancelar</Link>
                    </Button>
                  ) : (
                    <Button variant="ghost" type="button" onClick={() => void stepper.prev()}>
                      ← Atrás
                    </Button>
                  )}
                  {stepper.isLast ? (
                    <Button type="submit" disabled={enviando}>
                      {enviando ? "Abriendo…" : "Abrir expediente y emitir día 0"}
                    </Button>
                  ) : (
                    <Button type="button" onClick={continuar}>
                      Continuar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </BlurFade>
        </form>
      </Form>
    </div>
  );
}
