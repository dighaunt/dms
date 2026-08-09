"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { IconoSilk } from "@/components/iconos/silk";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { aCentavos, utilidadConsigna } from "@/lib/finanzas/calculos";
import { importeEnCasillas, vinEnCasillas } from "@/lib/finanzas/formato";

const MINIMO_NOTA_AUDITORIA = 20;

const FORMA_DEPOSITO_BANCARIO = "DEPOSITO_BANCARIO";

type Consigna = {
  ingresoDocumentoId: number;
  ingresoFolio: string;
  numeroExpediente: string;
  vin: string;
  marca: string;
  modelo: string;
  anio: number;
  precioMinimoVenta: string | null;
  comisionMonto: string | null;
  comisionPct: string | null;
  consignaFechaLimite: string | null;
};

type Folio = { id: number; folio: string };
type Sucursal = { id: number; clave: string; nombre: string };
type FormaPago = { codigo: string; etiqueta: string; afectaCajaFisica: boolean };

type GastoCapturado = { clave: number; concepto: string; importe: string };

type Ajuste = {
  id: number;
  montoAjuste: string;
  notaAuditoria: string;
  autorizadoPorNombre: string;
  creadoEn: string;
};

type LiquidacionGuardada = {
  documentoId: number;
  folio: string;
  precioVentaFinal: string;
  montoConsignante: string;
  gastosTotal: string;
  utilidadNeta: string;
  utilidadNetaAjustada: string;
  ajustes: Ajuste[];
};

type Props = {
  consignas: Consigna[];
  recibos: Folio[];
  sucursales: Sucursal[];
  formasPago: FormaPago[];
  ingresoPreseleccionado: number | null;
};

function soloImporte(valor: string): string {
  return valor.replace(/[^\d.]/g, "");
}

function soloImporteConSigno(valor: string): string {
  const limpio = valor.replace(/[^\d.-]/g, "");
  return limpio.startsWith("-")
    ? `-${limpio.slice(1).replace(/-/g, "")}`
    : limpio.replace(/-/g, "");
}

function esImportePositivo(valor: string): boolean {
  const centavos = aCentavos(valor);
  return centavos !== null && centavos > 0n;
}

function esImporteNoNegativo(valor: string): boolean {
  const centavos = aCentavos(valor);
  return centavos !== null && centavos >= 0n;
}

export function CapturaLiquidacion({
  consignas,
  recibos,
  sucursales,
  formasPago,
  ingresoPreseleccionado,
}: Props) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [guardada, setGuardada] = useState<LiquidacionGuardada | null>(null);

  const preseleccion =
    consignas.find((c) => c.ingresoDocumentoId === ingresoPreseleccionado) ?? consignas[0];

  const [sucursalId, setSucursalId] = useState<string>(String(sucursales[0]?.id ?? ""));
  const [ingresoId, setIngresoId] = useState<string>(String(preseleccion.ingresoDocumentoId));
  const [consignante, setConsignante] = useState("");
  const [reciboId, setReciboId] = useState("");

  const [precioVenta, setPrecioVenta] = useState("");
  const [montoConsignante, setMontoConsignante] = useState("");

  const proximaClave = useRef(2);
  const [gastos, setGastos] = useState<GastoCapturado[]>([
    { clave: 1, concepto: "", importe: "" },
  ]);

  const [formaIngreso, setFormaIngreso] = useState(formasPago[0]?.codigo ?? "");
  const [institucion, setInstitucion] = useState("");
  const [cuenta, setCuenta] = useState("");

  const consigna =
    consignas.find((c) => String(c.ingresoDocumentoId) === ingresoId) ?? preseleccion;

  const forma = formasPago.find((f) => f.codigo === formaIngreso);

  
  
  const exigeDatosBancarios = formaIngreso === FORMA_DEPOSITO_BANCARIO;

  const pideDatosBancarios =
    exigeDatosBancarios || (forma !== undefined && !forma.afectaCajaFisica);
  const datosBancariosListos =
    !exigeDatosBancarios || (institucion.trim().length >= 2 && cuenta.trim().length >= 4);

  const gastosNoVacios = useMemo(
    () => gastos.filter((g) => g.concepto.trim() !== "" || g.importe.trim() !== ""),
    [gastos],
  );
  const gastosCompletos = gastosNoVacios.every(
    (g) => g.concepto.trim().length >= 3 && esImportePositivo(g.importe),
  );

  
  const conceptos = gastosNoVacios.map((g) => g.concepto.trim()).filter((c) => c !== "");
  const hayConceptoRepetido = new Set(conceptos).size !== conceptos.length;

  const calculo = useMemo(
    () =>
      utilidadConsigna({
        precioVenta: esImporteNoNegativo(precioVenta) ? precioVenta : "0",
        montoConsignante: esImporteNoNegativo(montoConsignante) ? montoConsignante : "0",
        gastos: gastosNoVacios
          .filter((g) => esImportePositivo(g.importe))
          .map((g) => ({ concepto: g.concepto, importe: g.importe })),
      }),
    [precioVenta, montoConsignante, gastosNoVacios],
  );

  const minimoPactado = consigna.precioMinimoVenta;
  const bajoPrecioMinimo =
    minimoPactado !== null &&
    esImportePositivo(precioVenta) &&
    (aCentavos(precioVenta) as bigint) < (aCentavos(minimoPactado) as bigint);

  const consignanteExcedeVenta =
    esImportePositivo(precioVenta) &&
    esImporteNoNegativo(montoConsignante) &&
    (aCentavos(montoConsignante) as bigint) > (aCentavos(precioVenta) as bigint);

  const listo =
    sucursalId !== "" &&
    consignante.trim().length >= 3 &&
    esImportePositivo(precioVenta) &&
    esImporteNoNegativo(montoConsignante) &&
    !consignanteExcedeVenta &&
    formaIngreso !== "" &&
    datosBancariosListos &&
    gastosCompletos &&
    !hayConceptoRepetido;

  function actualizarGasto(clave: number, campo: "concepto" | "importe", valor: string) {
    setGastos((previos) =>
      previos.map((g) => (g.clave === clave ? { ...g, [campo]: valor } : g)),
    );
  }

  function agregarGasto() {
    setGastos((previos) => [
      ...previos,
      { clave: proximaClave.current++, concepto: "", importe: "" },
    ]);
  }

  function quitarGasto(clave: number) {
    setGastos((previos) => previos.filter((g) => g.clave !== clave));
  }

  async function guardar() {
    setGuardando(true);
    try {
      
      const emision = await fetch("/api/finanzas/documentos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipo: "CACM-RCI-03", sucursalId: Number(sucursalId) }),
      });
      if (!emision.ok) throw new Error((await emision.json()).error ?? "No se pudo emitir el folio");
      const documento = await emision.json();

      
      const captura = await fetch(`/api/finanzas/documentos/${documento.id}/rci03`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ingresoRci02Id: Number(ingresoId),
          reciboRci01Id: reciboId === "" ? null : Number(reciboId),
          consignanteNombre: consignante,
          precioVentaFinal: precioVenta,
          montoConsignante,
          formaIngresoTesoreria: formaIngreso,
          institucionBancaria: pideDatosBancarios ? institucion || null : null,
          cuentaBancaria: pideDatosBancarios ? cuenta || null : null,
          gastos: gastosNoVacios.map((g) => ({
            concepto: g.concepto.trim(),
            importe: g.importe,
          })),

        }),
      });
      if (!captura.ok) throw new Error((await captura.json()).error ?? "No se pudo guardar");

      const liquidacion = (await captura.json()) as LiquidacionGuardada;
      setGuardada(liquidacion);
      toast.success(`Folio ${liquidacion.folio} capturado`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la liquidación");
    } finally {
      setGuardando(false);
    }
  }

  if (guardada) {
    return (
      <PanelAjuste
        liquidacion={guardada}
        alActualizar={setGuardada}
        alSalir={() => router.push(`/finanzas/documentos/${guardada.documentoId}`)}
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            {}
            <CardTitle className="flex items-center gap-2">
              <IconoSilk nombre="enlace" className="shrink-0" />
              Parte I · Referencias de la operación
            </CardTitle>
            <CardDescription>
              La liquidación cuelga del ingreso a inventario que declaró la consignación. La ficha
              del vehículo viene de ahí y por eso no se teclea.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ingreso">
                1. Folio de Ingreso a Inventario (CACM-RCI-02) *
              </Label>
              <select
                id="ingreso"
                value={ingresoId}
                onChange={(e) => setIngresoId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {consignas.map((c) => (
                  <option key={c.ingresoDocumentoId} value={c.ingresoDocumentoId}>
                    {c.ingresoFolio} · {c.marca} {c.modelo} {c.anio}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Sólo aparecen las unidades con su ingreso firmado y sin liquidación previa.
              </p>
            </div>

            <div className="rounded-md border bg-muted/40 p-4 text-sm sm:col-span-2">
              <p className="text-xs text-muted-foreground">2. Vehículo (marca / modelo / VIN)</p>
              <p className="mt-0.5 font-medium">
                {consigna.marca} {consigna.modelo} {consigna.anio}
              </p>
              <p className="mt-1 font-mono text-xs tracking-[0.2em]">
                {vinEnCasillas(consigna.vin)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">Expediente {consigna.numeroExpediente}</Badge>
                {consigna.precioMinimoVenta !== null && (
                  <Badge variant="secondary">
                    Mínimo autorizado {importeEnCasillas(consigna.precioMinimoVenta).texto}
                  </Badge>
                )}
                {consigna.comisionMonto !== null && (
                  <Badge variant="secondary">
                    Comisión pactada {importeEnCasillas(consigna.comisionMonto).texto}
                  </Badge>
                )}
                {consigna.comisionPct !== null && (
                  <Badge variant="secondary">Comisión pactada {consigna.comisionPct} %</Badge>
                )}
                {consigna.consignaFechaLimite !== null && (
                  <Badge variant="outline">Plazo hasta {consigna.consignaFechaLimite}</Badge>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="consignante">3. Nombre del consignante *</Label>
              <Input
                id="consignante"
                value={consignante}
                onChange={(e) => setConsignante(e.target.value)}
                maxLength={200}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="recibo">4. Recibo de Caja Interno de la venta (CACM-RCI-01)</Label>
              <select
                id="recibo"
                value={reciboId}
                onChange={(e) => setReciboId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">— sin recibo citado —</option>
                {recibos.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.folio}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconoSilk nombre="peso" className="shrink-0" />
              Parte II · Cálculo de la liquidación
            </CardTitle>
            <CardDescription>
              Se capturan tres cifras: lo que se vendió, lo que se le entrega al consignante y los
              gastos. La cuarta —la utilidad— la calcula el sistema.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="precio-venta">5. Precio de venta final *</Label>
                <Input
                  id="precio-venta"
                  value={precioVenta}
                  onChange={(e) => setPrecioVenta(soloImporte(e.target.value))}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="text-lg"
                />
                {esImportePositivo(precioVenta) && (
                  <p className="text-xs text-muted-foreground">
                    {importeEnCasillas(precioVenta).letra}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="monto-consignante">
                  6. (–) Monto a liquidar al consignante *
                </Label>
                <Input
                  id="monto-consignante"
                  value={montoConsignante}
                  onChange={(e) => setMontoConsignante(soloImporte(e.target.value))}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="text-lg"
                />
                {esImportePositivo(montoConsignante) && (
                  <p className="text-xs text-muted-foreground">
                    {importeEnCasillas(montoConsignante).letra}
                  </p>
                )}
              </div>
            </div>

            {consignanteExcedeVenta && (
              <Alert variant="destructive">
                <IconoSilk nombre="alerta" />
                <AlertTitle>Al consignante no puede irle más de lo que se vendió</AlertTitle>
                <AlertDescription>
                  El renglón 6 supera al renglón 5. Si la operación dejó pérdida, tiene que
                  aparecer en los gastos del renglón 7, que es donde se puede revisar de dónde
                  salió.
                </AlertDescription>
              </Alert>
            )}

            {bajoPrecioMinimo && (

              <Alert>
                <IconoSilk nombre="advertencia" />
                <AlertTitle>La venta quedó bajo el mínimo autorizado</AlertTitle>
                <AlertDescription>
                  El consignante autorizó {importeEnCasillas(minimoPactado ?? "0").texto} y la venta
                  se cerró en {importeEnCasillas(precioVenta).texto}. No impide liquidar, pero
                  conviene que conste por qué.
                </AlertDescription>
              </Alert>
            )}

            <Separator />

            <div className="space-y-3">
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">7. (–) Gastos asociados</p>
                  <p className="text-xs text-muted-foreground">
                    Reacondicionamiento, comisión del vendedor, traslados. Renglón por renglón: un
                    total sin desglose no se puede revisar después.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={agregarGasto}>
                  <IconoSilk nombre="agregar" className="shrink-0" />
                  Agregar renglón
                </Button>
              </div>

              <div className="space-y-2">
                {gastos.map((gasto) => (
                  <div key={gasto.clave} className="flex flex-wrap items-start gap-2">
                    <Input
                      value={gasto.concepto}
                      onChange={(e) => actualizarGasto(gasto.clave, "concepto", e.target.value)}
                      placeholder="Concepto del gasto"
                      maxLength={160}
                      className="min-w-48 flex-1"
                      aria-label="Concepto del gasto"
                    />
                    <Input
                      value={gasto.importe}
                      onChange={(e) =>
                        actualizarGasto(gasto.clave, "importe", soloImporte(e.target.value))
                      }
                      inputMode="decimal"
                      placeholder="0.00"
                      className="w-32"
                      aria-label="Importe del gasto"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => quitarGasto(gasto.clave)}
                      disabled={gastos.length === 1}
                    >
                      Quitar
                    </Button>
                  </div>
                ))}
              </div>

              {!gastosCompletos && (
                <p className="text-xs text-destructive">
                  Cada renglón necesita concepto (al menos 3 caracteres) e importe mayor que cero.
                  Deja el renglón vacío si no aplica.
                </p>
              )}
              {hayConceptoRepetido && (
                <p className="text-xs text-destructive">
                  Hay dos renglones con el mismo concepto. Si son gastos distintos, distíngueles el
                  texto; si es el mismo, quita uno.
                </p>
              )}
            </div>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="forma-ingreso">
                  9. Forma en que la utilidad ingresa a tesorería *
                </Label>
                <select
                  id="forma-ingreso"
                  value={formaIngreso}
                  onChange={(e) => setFormaIngreso(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  {formasPago.map((f) => (
                    <option key={f.codigo} value={f.codigo}>
                      {f.etiqueta}
                    </option>
                  ))}
                </select>
              </div>

              {pideDatosBancarios && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="institucion">
                      Institución bancaria {exigeDatosBancarios && "*"}
                    </Label>
                    <Input
                      id="institucion"
                      value={institucion}
                      onChange={(e) => setInstitucion(e.target.value)}
                      maxLength={80}
                      aria-invalid={exigeDatosBancarios && institucion.trim().length < 2}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cuenta">Cuenta {exigeDatosBancarios && "*"}</Label>
                    <Input
                      id="cuenta"
                      value={cuenta}
                      onChange={(e) => setCuenta(e.target.value)}
                      maxLength={40}
                      aria-invalid={exigeDatosBancarios && cuenta.trim().length < 4}
                    />
                  </div>
                  {exigeDatosBancarios && !datosBancariosListos && (
                    <p className="text-xs text-destructive sm:col-span-2">
                      Un depósito bancario tiene que decir a qué banco y a qué cuenta entró la
                      utilidad; si no, el corte del día no puede seguirle la pista.
                    </p>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconoSilk nombre="peso" className="shrink-0" />
              8. Utilidad neta de la empresa
            </CardTitle>
            <CardDescription>
              La calcula el sistema. No es un campo: es el resultado de las tres cifras de arriba, y
              la base la vuelve a calcular al guardar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Renglon
              etiqueta="Precio de venta"
              valor={importeEnCasillas(calculo?.precioVenta ?? "0").texto}
            />
            <Renglon
              etiqueta="(–) Al consignante"
              valor={importeEnCasillas(calculo?.montoConsignante ?? "0").texto}
            />
            <Renglon
              etiqueta="(–) Gastos"
              valor={importeEnCasillas(calculo?.gastosTotal ?? "0").texto}
            />

            <div className="border-t pt-3">
              <p className="text-xs text-muted-foreground">(=) Utilidad neta</p>
              <p
                className={`mt-1 text-2xl font-semibold ${
                  calculo?.esNegativa ? "text-destructive" : ""
                }`}
              >
                {importeEnCasillas(calculo?.utilidadNeta ?? "0").texto}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {importeEnCasillas(calculo?.utilidadNeta ?? "0").letra}
              </p>
            </div>

            {calculo?.esNegativa && (

              <Alert variant="destructive">
                <IconoSilk nombre="alerta" />
                <AlertTitle>Esta consigna deja pérdida</AlertTitle>
                <AlertDescription>
                  Los gastos y lo que se entrega al consignante superan el precio de venta. Se puede
                  guardar tal cual: el sistema registra la pérdida en vez de disimularla.
                </AlertDescription>
              </Alert>
            )}

            <Separator />

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

            <Button className="w-full" disabled={guardando || !listo} onClick={guardar}>
              <IconoSilk nombre="guardar" className="shrink-0" />
              {guardando ? "Guardando…" : "Emitir folio y guardar"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Al guardar, la utilidad que quede es la que calculó la base. Después de eso ya no se
              edita: se ajusta, y el ajuste se registra aparte.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Renglon({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{etiqueta}</span>
      <span className="font-medium">{valor}</span>
    </div>
  );
}

function PanelAjuste({
  liquidacion,
  alActualizar,
  alSalir,
}: {
  liquidacion: LiquidacionGuardada;
  alActualizar: (nueva: LiquidacionGuardada) => void;
  alSalir: () => void;
}) {
  const [monto, setMonto] = useState("");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);

  const centavos = aCentavos(monto);
  const montoValido = centavos !== null && centavos !== 0n;
  const notaValida = nota.trim().length >= MINIMO_NOTA_AUDITORIA;
  const utilidadEsNegativa = (aCentavos(liquidacion.utilidadNeta) ?? 0n) < 0n;

  async function registrarAjuste() {
    setEnviando(true);
    try {
      const respuesta = await fetch(`/api/finanzas/documentos/${liquidacion.documentoId}/rci03`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ montoAjuste: monto, notaAuditoria: nota }),
      });
      if (!respuesta.ok) {
        throw new Error((await respuesta.json()).error ?? "No se pudo registrar el ajuste");
      }

      const { liquidacion: actualizada } = (await respuesta.json()) as {
        liquidacion: LiquidacionGuardada;
      };
      alActualizar(actualizada);
      setMonto("");
      setNota("");
      toast.success("Ajuste registrado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo registrar el ajuste");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <IconoSilk nombre="correcto" className="shrink-0" />
              <span>
                Folio <span className="font-mono">{liquidacion.folio}</span> guardado
              </span>
            </CardTitle>
            <CardDescription>
              Estas son las cifras tal como quedaron en la base. La utilidad no se tecleó: se
              calculó a partir de las otras tres.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Renglon
              etiqueta="Precio de venta"
              valor={importeEnCasillas(liquidacion.precioVentaFinal).texto}
            />
            <Renglon
              etiqueta="(–) Al consignante"
              valor={importeEnCasillas(liquidacion.montoConsignante).texto}
            />
            <Renglon
              etiqueta="(–) Gastos"
              valor={importeEnCasillas(liquidacion.gastosTotal).texto}
            />
            <div className="flex justify-between border-t pt-3">
              <span className="font-medium">(=) Utilidad neta</span>
              <span
                className={`text-lg font-semibold ${utilidadEsNegativa ? "text-destructive" : ""}`}
              >
                {importeEnCasillas(liquidacion.utilidadNeta).texto}
              </span>
            </div>
            {utilidadEsNegativa && (
              <Alert variant="destructive">
                <IconoSilk nombre="alerta" />
                <AlertTitle>Esta consigna dejó pérdida</AlertTitle>
                <AlertDescription>
                  Queda registrada así. Un ajuste no la borra: la explica.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconoSilk nombre="editar" className="shrink-0" />
              Ajuste de utilidad
            </CardTitle>
            <CardDescription>
              Un ajuste no reescribe el renglón 8. La utilidad firmada sigue siendo{" "}
              {importeEnCasillas(liquidacion.utilidadNeta).texto}, porque es la que se puede
              reproducir desde el precio, lo del consignante y los gastos —y es la que el
              consignante vio—. El ajuste se asienta al lado, con quién lo autorizó, cuándo y por
              qué, y ya no se puede borrar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="monto-ajuste">Monto del ajuste *</Label>
              <Input
                id="monto-ajuste"
                value={monto}
                onChange={(e) => setMonto(soloImporteConSigno(e.target.value))}
                inputMode="decimal"
                placeholder="-1500.00"
                className="max-w-xs"
              />
              <p className="text-xs text-muted-foreground">
                Con signo: negativo si la utilidad real fue menor, positivo si fue mayor. Cero no es
                un ajuste.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nota-ajuste">Nota de auditoría *</Label>
              <Textarea
                id="nota-ajuste"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Qué se descubrió, sobre qué documento consta y por qué cambia la utilidad."
              />
              <p
                className={`text-xs ${notaValida ? "text-muted-foreground" : "text-destructive"}`}
              >
                {nota.trim().length} / {MINIMO_NOTA_AUDITORIA} caracteres mínimos. Sin explicación,
                un ajuste es indistinguible de un descuadre.
              </p>
            </div>

            <Button
              disabled={enviando || !montoValido || !notaValida}
              onClick={registrarAjuste}
            >
              <IconoSilk nombre="guardar" className="shrink-0" />
              {enviando ? "Registrando…" : "Registrar ajuste"}
            </Button>
          </CardContent>
        </Card>

        {liquidacion.ajustes.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <IconoSilk nombre="listado" className="shrink-0" />
                Ajustes registrados
              </CardTitle>
              <CardDescription>
                Cada uno es un hecho independiente. Ninguno modificó la utilidad firmada.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {liquidacion.ajustes.map((ajuste) => (
                  <li key={ajuste.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {importeEnCasillas(ajuste.montoAjuste).texto}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {ajuste.autorizadoPorNombre} ·{" "}
                        {new Date(ajuste.creadoEn).toLocaleString("es-MX")}
                      </span>
                    </div>
                    <p className="text-muted-foreground">{ajuste.notaAuditoria}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconoSilk nombre="peso" className="shrink-0" />
              Resultado
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Renglon
              etiqueta="Utilidad firmada"
              valor={importeEnCasillas(liquidacion.utilidadNeta).texto}
            />
            <Renglon
              etiqueta="Con ajustes"
              valor={importeEnCasillas(liquidacion.utilidadNetaAjustada).texto}
            />
            <p className="text-xs text-muted-foreground">
              La primera es la que firma el consignante y la que se imprime. La segunda existe para
              los reportes internos: dice cuánto ganó la empresa después de las correcciones.
            </p>
            <Button className="w-full" variant="secondary" onClick={alSalir}>
              <IconoSilk nombre="documento" className="shrink-0" />
              Abrir el folio y enviarlo a firma
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
