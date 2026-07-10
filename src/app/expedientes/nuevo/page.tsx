"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { BlurFade } from "@/components/ui/blur-fade";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  origen: z.enum(["PROPIA", "CONSIGNADA"], { error: "Elige el origen" }),
});

type Valores = z.input<typeof esquema>;

type FolioEmitido = {
  documentoId: number;
  tipo: string;
  revision: string;
  folio: string;
};

type Resultado = {
  expediente: { id: number; numeroExpediente: string; vin: string; origen: string };
  folios: FolioEmitido[];
};

export default function NuevoExpedientePage() {
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const form = useForm<Valores, unknown, z.output<typeof esquema>>({
    resolver: zodResolver(esquema),
    mode: "onChange",
    defaultValues: {
      vin: "",
      marcaNombre: "",
      modeloNombre: "",
      anioModelo: new Date().getFullYear() - 5,
      color: "",
      origen: undefined,
    },
  });

  async function onSubmit(valores: z.output<typeof esquema>) {
    const res = await fetch("/api/expedientes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...valores,
        color: valores.color || undefined,
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
  }

  if (resultado) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/expedientes" className="hover:underline">
              Expedientes
            </Link>{" "}
            / Nuevo
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Expediente {resultado.expediente.numeroExpediente} abierto
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            VIN <span className="font-mono">{resultado.expediente.vin}</span> · juego
            día 0 emitido:
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border bg-background">
          {resultado.folios.map((f, i) => (
            <BlurFade key={f.documentoId} delay={0.1 + i * 0.08}>
              <div className="flex items-center justify-between border-b px-4 py-3 last:border-b-0">
                <div>
                  <p className="font-mono text-sm font-medium">{f.folio}</p>
                  <p className="text-xs text-muted-foreground">
                    {f.tipo} · Rev {f.revision}
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
            <Link href={`/expedientes/${resultado.expediente.id}`}>
              Ir al expediente
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/expedientes">Volver al listado</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/expedientes" className="hover:underline">
            Expedientes
          </Link>{" "}
          / Nuevo
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Abrir expediente</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Al abrir se emite el juego día 0: contrato fuente (C-03/C-04), F-03, F-05 y
          F-06.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos de la unidad</CardTitle>
          <CardDescription>
            El VIN identifica el expediente de forma única.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5">
              <FormField
                control={form.control}
                name="vin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>VIN</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        maxLength={17}
                        placeholder="3N1CN7AD4KL812345"
                        className="font-mono uppercase"
                        autoComplete="off"
                      />
                    </FormControl>
                    <FormDescription>
                      {(field.value ?? "").length}/17 caracteres
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="marcaNombre"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Marca</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Nissan" />
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
              </div>
              <div className="grid grid-cols-2 gap-4">
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
              </div>
              <FormField
                control={form.control}
                name="origen"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Origen</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecciona el origen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="PROPIA">
                          Propia (contrato fuente C-03)
                        </SelectItem>
                        <SelectItem value="CONSIGNADA">
                          Consignada (contrato fuente C-04)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" type="button" asChild>
                  <Link href="/expedientes">Cancelar</Link>
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting
                    ? "Abriendo…"
                    : "Abrir expediente y emitir día 0"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
