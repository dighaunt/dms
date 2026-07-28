"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserIcon } from "lucide-react";

import { IconoSilk } from "@/components/iconos/silk";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { aCentavos, deCentavos } from "@/lib/finanzas/calculos";
import { importeEnCasillas } from "@/lib/finanzas/formato";

type Sucursal = { id: number; clave: string; nombre: string };
type Empleado = { id: number; numEmpleado: string; nombre: string; puesto: string | null };
type FormaPago = { codigo: string; etiqueta: string };

type Props = {
  sucursales: Sucursal[];
  empleados: Empleado[];
  formasPago: FormaPago[];
};

/** Las seis partidas que SÍ se teclean, en el orden de la Parte II del papel. */
type Partida =
  | "percepcionSueldo"
  | "percepcionComisiones"
  | "percepcionOtras"
  | "deduccionIsr"
  | "deduccionImssInfonavit"
  | "deduccionOtras";

const PERCEPCIONES: { clave: Partida; etiqueta: string }[] = [
  { clave: "percepcionSueldo", etiqueta: "Sueldo" },
  { clave: "percepcionComisiones", etiqueta: "Comisiones" },
  { clave: "percepcionOtras", etiqueta: "Otras percepciones" },
];

const DEDUCCIONES: { clave: Partida; etiqueta: string }[] = [
  { clave: "deduccionIsr", etiqueta: "ISR" },
  { clave: "deduccionImssInfonavit", etiqueta: "IMSS / INFONAVIT" },
  { clave: "deduccionOtras", etiqueta: "Otras deducciones" },
];

/** Fecha civil de hoy, armada con las partes locales. */
function hoyCivil(): string {
  const ahora = new Date();
  const dosDigitos = (n: number) => String(n).padStart(2, "0");
  return `${ahora.getFullYear()}-${dosDigitos(ahora.getMonth() + 1)}-${dosDigitos(ahora.getDate())}`;
}

/** Deja pasar sólo lo que puede llegar a ser un importe: dígitos y un punto. */
function soloImporte(valor: string): string {
  return valor.replace(/[^\d.]/g, "");
}

/** Una casilla vacía del papel es cero, no "sin dato": la columna es NOT NULL DEFAULT 0. */
function centavosDePartida(valor: string): bigint | null {
  if (valor.trim() === "") return 0n;
  return aCentavos(valor);
}

/**
 * Captura del CACM-RCI-06, en el orden del papel: Parte I trabajador y período,
 * Parte II percepciones y deducciones, Parte III neto pagado y forma de pago.
 *
 * DOS COSAS QUE ESTA PANTALLA HACE DISTINTO Y QUE SON EL PUNTO DEL FORMATO:
 *
 *  1. Los tres totales —percepciones, deducciones y NETO— no se teclean ni se
 *     mandan al servidor. En la base son columnas GENERATED ALWAYS y Postgres
 *     rechaza cualquier intento de escribirlas. Lo que se ve aquí mientras se
 *     captura es la MISMA aritmética reproducida en centavos enteros para poder
 *     mostrar el resultado antes de guardar; la cifra que vale, y la que se
 *     imprime en la constancia, es la que devuelve la base. Si las dos no
 *     coincidieran, manda la base y esta pantalla lo dice en voz alta.
 *
 *  2. Un neto negativo es imposible: significaría que el trabajador le debe a la
 *     empresa por su propio recibo de sueldo. La tabla lo impide con un CHECK;
 *     aquí el botón se apaga antes, para que nadie llegue a intentarlo y reciba
 *     un error críptico después de haber quemado un folio.
 */
export function CapturaNomina({ sucursales, empleados, formasPago }: Props) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);

  const [sucursalId, setSucursalId] = useState<string>(String(sucursales[0]?.id ?? ""));

  // Parte I — trabajador y período.
  const [empleadoId, setEmpleadoId] = useState<string>(String(empleados[0]?.id ?? ""));
  const [periodoInicio, setPeriodoInicio] = useState(hoyCivil());
  const [periodoFin, setPeriodoFin] = useState(hoyCivil());

  // Parte II — las seis partidas. Vacío se guarda como 0.00.
  const [partidas, setPartidas] = useState<Record<Partida, string>>({
    percepcionSueldo: "",
    percepcionComisiones: "",
    percepcionOtras: "",
    deduccionIsr: "",
    deduccionImssInfonavit: "",
    deduccionOtras: "",
  });

  // Parte III — forma de pago.
  const [formaPago, setFormaPago] = useState(formasPago[0]?.codigo ?? "");

  const empleado = useMemo(
    () => empleados.find((e) => String(e.id) === empleadoId) ?? null,
    [empleados, empleadoId],
  );

  /**
   * Los tres totales en vivo. Se suman en centavos enteros con BigInt y nunca
   * en punto flotante: 0.1 + 0.2 no da 0.3, y aquí un centavo de diferencia es
   * la diferencia entre un recibo que cuadra y uno que un trabajador puede
   * reclamar.
   */
  const totales = useMemo(() => {
    let percepciones = 0n;
    let deducciones = 0n;
    let ilegible = false;

    for (const { clave } of PERCEPCIONES) {
      const valor = centavosDePartida(partidas[clave]);
      if (valor === null || valor < 0n) ilegible = true;
      else percepciones += valor;
    }
    for (const { clave } of DEDUCCIONES) {
      const valor = centavosDePartida(partidas[clave]);
      if (valor === null || valor < 0n) ilegible = true;
      else deducciones += valor;
    }

    return { percepciones, deducciones, neto: percepciones - deducciones, ilegible };
  }, [partidas]);

  const netoNegativo = totales.neto < 0n;
  const periodoValido = periodoInicio !== "" && periodoFin !== "" && periodoFin >= periodoInicio;

  const listo =
    sucursalId !== "" &&
    empleadoId !== "" &&
    formaPago !== "" &&
    periodoValido &&
    !totales.ilegible &&
    !netoNegativo &&
    totales.percepciones > 0n;

  function fijarPartida(clave: Partida, valor: string) {
    setPartidas((previas) => ({ ...previas, [clave]: soloImporte(valor) }));
  }

  async function guardar() {
    if (!listo) return;
    setGuardando(true);
    try {
      // 1) El folio primero: el consecutivo lo entrega la base, nunca la UI.
      const emision = await fetch("/api/finanzas/documentos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipo: "CACM-RCI-06", sucursalId: Number(sucursalId) }),
      });
      if (!emision.ok) throw new Error((await emision.json()).error ?? "No se pudo emitir el folio");
      const documento = await emision.json();

      // 2) Sólo las seis partidas. Los totales y el neto NO viajan: son
      //    columnas GENERATED y mandarlas sería pedirle a la base que acepte
      //    una segunda opinión sobre cuánto se le paga a esta persona.
      const captura = await fetch(`/api/finanzas/documentos/${documento.id}/rci06`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          empleadoId: Number(empleadoId),
          periodoInicio,
          periodoFin,
          percepcionSueldo: partidas.percepcionSueldo,
          percepcionComisiones: partidas.percepcionComisiones,
          percepcionOtras: partidas.percepcionOtras,
          deduccionIsr: partidas.deduccionIsr,
          deduccionImssInfonavit: partidas.deduccionImssInfonavit,
          deduccionOtras: partidas.deduccionOtras,
          formaPago,
        }),
      });
      if (!captura.ok) throw new Error((await captura.json()).error ?? "No se pudo guardar");

      // La respuesta trae el neto releído de la fila guardada. Se compara
      // contra el que se mostró en pantalla porque, si alguna vez difirieran,
      // quien capturó tiene que enterarse en ese momento y no cuando el
      // trabajador cuente el dinero: la cifra buena es siempre la de la base.
      const recibo = (await captura.json()) as { netoPagado?: string };
      const netoBase = aCentavos(recibo.netoPagado);

      if (netoBase === null) {
        toast.success(`Folio ${documento.folio} capturado`);
      } else if (netoBase !== totales.neto) {
        toast.warning(
          `El neto que calculó la base es ${importeEnCasillas(deCentavos(netoBase)).texto} y esta pantalla mostraba ${importeEnCasillas(deCentavos(totales.neto)).texto}. Vale la cifra de la base: revisa el folio antes de firmarlo.`,
        );
      } else {
        toast.success(
          `Folio ${documento.folio} capturado · neto ${importeEnCasillas(deCentavos(netoBase)).texto}`,
        );
      }

      router.push(`/finanzas/documentos/${documento.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el recibo");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            {/* Silk no dibuja persona; el trabajador es justo lo que esta parte
                identifica, así que aquí se queda el juego monocromo. */}
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="size-4 shrink-0" />
              Parte I · Datos del trabajador y período
            </CardTitle>
            <CardDescription>
              Puesto y número de empleado vienen del catálogo de personal y por eso no se teclean:
              si se volvieran a capturar, el recibo y la ficha del trabajador podrían acabar
              describiendo a dos personas.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sucursal">Sucursal / Agencia *</Label>
              <select
                id="sucursal"
                value={sucursalId}
                onChange={(e) => setSucursalId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.clave} · {s.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="empleado">1. Nombre completo del trabajador *</Label>
              <select
                id="empleado"
                value={empleadoId}
                onChange={(e) => setEmpleadoId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {empleados.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.numEmpleado} · {e.nombre}
                  </option>
                ))}
              </select>
            </div>

            {empleado && (
              <div className="grid gap-4 rounded-md border bg-muted/40 p-4 text-sm sm:col-span-2 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">2. Puesto</p>
                  <p className="mt-0.5 font-medium">{empleado.puesto ?? "sin registrar"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">3. No. de empleado</p>
                  <p className="mt-0.5 font-mono font-medium">{empleado.numEmpleado}</p>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="periodo-inicio">4. Período de pago — del *</Label>
              <Input
                id="periodo-inicio"
                type="date"
                value={periodoInicio}
                onChange={(e) => setPeriodoInicio(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="periodo-fin">al *</Label>
              <Input
                id="periodo-fin"
                type="date"
                value={periodoFin}
                onChange={(e) => setPeriodoFin(e.target.value)}
                aria-invalid={!periodoValido}
              />
              {!periodoValido && (
                <p className="text-xs text-destructive">
                  El período no puede terminar antes de empezar.
                </p>
              )}
            </div>

            <p className="text-xs text-muted-foreground sm:col-span-2">
              Un trabajador cobra una sola vez cada período: si ya existe un recibo suyo con estas
              mismas fechas, la base rechazará el segundo. Para corregir uno ya firmado se emite un
              complementario, no otro recibo del mismo período.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconoSilk nombre="monedas" className="shrink-0" />
              Parte II · Percepciones y deducciones
            </CardTitle>
            <CardDescription>
              Los renglones que no apliquen se dejan en blanco y valen cero. Los dos totales los
              suma la base al guardar; lo que ves mientras capturas es la misma cuenta hecha en
              centavos enteros para poder revisarla antes.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-3">
              <p className="text-sm font-medium">Percepciones</p>
              {PERCEPCIONES.map(({ clave, etiqueta }) => (
                <div key={clave} className="space-y-1.5">
                  <Label htmlFor={clave}>{etiqueta}</Label>
                  <Input
                    id={clave}
                    value={partidas[clave]}
                    onChange={(e) => fijarPartida(clave, e.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-invalid={centavosDePartida(partidas[clave]) === null}
                  />
                </div>
              ))}
              <div className="flex justify-between border-t pt-2 text-sm">
                <span className="text-muted-foreground">5. Total percepciones</span>
                <span className="font-semibold">
                  {importeEnCasillas(deCentavos(totales.percepciones)).texto}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Deducciones</p>
              {DEDUCCIONES.map(({ clave, etiqueta }) => (
                <div key={clave} className="space-y-1.5">
                  <Label htmlFor={clave}>{etiqueta}</Label>
                  <Input
                    id={clave}
                    value={partidas[clave]}
                    onChange={(e) => fijarPartida(clave, e.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-invalid={centavosDePartida(partidas[clave]) === null}
                  />
                </div>
              ))}
              <div className="flex justify-between border-t pt-2 text-sm">
                <span className="text-muted-foreground">6. Total deducciones</span>
                <span className="font-semibold">
                  {importeEnCasillas(deCentavos(totales.deducciones)).texto}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconoSilk nombre="peso" className="shrink-0" />
              Parte III · Neto pagado
            </CardTitle>
            <CardDescription>
              El neto no es una casilla que se teclee: es percepciones menos deducciones, y lo
              calcula la base.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-4">
              <p className="text-xs text-muted-foreground">7. Neto pagado</p>
              <p className="mt-1 text-2xl font-semibold">
                {importeEnCasillas(deCentavos(totales.neto)).texto}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {importeEnCasillas(deCentavos(totales.neto)).letra}
              </p>
            </div>

            <div className="space-y-1.5 max-w-xs">
              <Label htmlFor="forma-pago">8. Forma de pago *</Label>
              <select
                id="forma-pago"
                value={formaPago}
                onChange={(e) => setFormaPago(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {formasPago.map((f) => (
                  <option key={f.codigo} value={f.codigo}>
                    {f.etiqueta}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                El salario en efectivo se paga precisamente en moneda de curso legal (LFT art. 101).
              </p>
            </div>

            <Separator />

            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                El trabajador declara haber recibido de conformidad el importe neto señalado,
                correspondiente al período indicado.
              </p>
              <p className="text-xs">
                Fundamento: Ley Federal del Trabajo — el salario en efectivo debe pagarse
                precisamente en moneda de curso legal (Art. 101); este recibo forma parte de los
                comprobantes que el patrón está obligado a conservar y exhibir en caso de
                controversia sobre el pago de salarios (Art. 804).
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconoSilk nombre="listado" className="shrink-0" />
              Cálculo en vivo
            </CardTitle>
            <CardDescription>{empleado?.nombre ?? "sin trabajador"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Percepciones</span>
              <span className="font-medium">
                {importeEnCasillas(deCentavos(totales.percepciones)).texto}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">(–) Deducciones</span>
              <span className="font-medium">
                {importeEnCasillas(deCentavos(totales.deducciones)).texto}
              </span>
            </div>
            <div className="flex justify-between border-t pt-3">
              <span className="text-muted-foreground">(=) Neto</span>
              <span className="font-semibold">
                {importeEnCasillas(deCentavos(totales.neto)).texto}
              </span>
            </div>

            {totales.ilegible && (
              <Badge variant="destructive" className="w-full justify-center py-1">
                Hay una partida que no se entiende como importe
              </Badge>
            )}

            {netoNegativo && (
              // No es un capricho de validación: un neto negativo diría que el
              // trabajador le debe a la empresa por su propio recibo de sueldo.
              // El CHECK de la tabla lo rechazaría igual, pero después de haber
              // consumido un folio consecutivo que ya no se puede reciclar.
              <Alert variant="destructive">
                <IconoSilk nombre="alerta" />
                <AlertTitle>Las deducciones superan a las percepciones</AlertTitle>
                <AlertDescription>
                  Un neto negativo significaría que el trabajador le debe a la empresa por su propio
                  recibo de sueldo. Eso no es un recibo de pago: corrige las cifras antes de emitir
                  el folio.
                </AlertDescription>
              </Alert>
            )}

            {!netoNegativo && !totales.ilegible && totales.percepciones === 0n && (
              <p className="text-xs text-muted-foreground">
                Captura al menos una percepción: un recibo de nómina en ceros no acredita ningún
                pago.
              </p>
            )}

            <Alert>
              <IconoSilk nombre="informacion" />
              <AlertTitle>La cifra que vale es la de la base</AlertTitle>
              <AlertDescription>
                Totales y neto son columnas calculadas por la base de datos y no se envían desde
                aquí. Este cálculo sirve para revisar antes de guardar; al guardar se mostrará el
                que devolvió la base.
              </AlertDescription>
            </Alert>

            <div className="space-y-1 border-t pt-3">
              <p className="text-xs text-muted-foreground">Firmas que pedirá este formato</p>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline">Recibí conforme — Trabajador</Badge>
                <Badge variant="outline">Entregó — Custodio / RH</Badge>
                <Badge variant="outline">Testigo (opcional)</Badge>
              </div>
            </div>

            <Button className="w-full" disabled={guardando || !listo} onClick={guardar}>
              <IconoSilk nombre="guardar" className="shrink-0" />
              {guardando ? "Guardando…" : "Emitir folio y guardar"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Este recibo no mueve la caja. El efectivo sale por su vale de egreso (CACM-RCI-05,
              concepto pago de nómina) citando este folio; contar los dos duplicaría el egreso del
              corte.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
