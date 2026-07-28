"use client";

import { useState } from "react";
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
import { aCentavos } from "@/lib/finanzas/calculos";
import { casillasVin, importeEnCasillas } from "@/lib/finanzas/formato";
import { MAXIMO_KILOMETRAJE_UNIDAD } from "@/lib/unidad";

type TipoOperacion = "COMPRA_DIRECTA" | "CONSIGNACION";

/**
 * Ficha que el expediente ya resolvió. Se declara aquí y no se importa de
 * "@/lib/finanzas/consignacion" porque ese módulo es `server-only`.
 */
type Ficha = {
  expedienteId: number;
  numeroExpediente: string;
  origen: "PROPIA" | "CONSIGNADA";
  tipoOperacion: TipoOperacion;
  vin: string;
  marca: string;
  modelo: string;
  anio: number;
  color: string | null;
  numMotor: string | null;
  kilometrajeIngreso: number | null;
};

type Sucursal = { id: number; clave: string; nombre: string };
type FormaPago = { codigo: string; etiqueta: string };

type Props = {
  ficha: Ficha;
  sucursales: Sucursal[];
  formasPago: FormaPago[];
};

/** Cómo se pactó la comisión. El CHECK de la tabla admite una, nunca las dos. */
type ModoComision = "MONTO" | "PORCENTAJE";

/**
 * Fecha civil de hoy. Se arma con las partes locales y no con `toISOString()`
 * porque esta columna es `date`: en un huso al oeste de Greenwich, la fecha UTC
 * de la noche ya es la de mañana, y el ingreso quedaría fechado un día después
 * de que la unidad entró de verdad al piso.
 */
function hoyCivil(): string {
  const ahora = new Date();
  return [
    ahora.getFullYear(),
    String(ahora.getMonth() + 1).padStart(2, "0"),
    String(ahora.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Deja pasar sólo lo que puede llegar a ser un importe: dígitos y un punto. */
function soloImporte(valor: string): string {
  return valor.replace(/[^\d.]/g, "");
}

function esImportePositivo(valor: string): boolean {
  const centavos = aCentavos(valor);
  return centavos !== null && centavos > 0n;
}

/** El CHECK de `comision_monto` admite el cero; aquí tampoco se prohíbe. */
function esImporteNoNegativo(valor: string): boolean {
  const centavos = aCentavos(valor);
  return centavos !== null && centavos >= 0n;
}

/** Mismo rango que `esquemaPorcentaje`: mayor que cero y hasta 100. */
function esPorcentajeValido(valor: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(valor.trim())) return false;
  const centesimas = aCentavos(valor);
  return centesimas !== null && centesimas > 0n && centesimas <= 10_000n;
}

/**
 * Captura del CACM-RCI-02, en el orden del papel: Parte I la unidad, Parte II
 * quien la entrega y el tipo de operación, Parte III las condiciones económicas.
 *
 * Dos cosas separan esta pantalla de la forma impresa, y las dos son a
 * propósito. La primera: la Parte I no se teclea. Marca, modelo, año y VIN ya
 * están en el expediente y se muestran resueltos; volver a escribirlos es la
 * manera más fácil de que el folio financiero y el expediente acaben hablando
 * de dos coches distintos. La segunda: la Parte III enseña UN solo bloque. En
 * el papel conviven los dos y quien llena tacha el que no aplica; aquí no puede
 * quedar tachadura, así que el bloque que no corresponde no se dibuja.
 */
export function CapturaIngreso({ ficha, sucursales, formasPago }: Props) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);

  const [sucursalId, setSucursalId] = useState<string>(String(sucursales[0]?.id ?? ""));

  // Parte I — lo que el papel pide de la unidad y el expediente no sabe.
  const [placas, setPlacas] = useState("");
  const [kilometraje, setKilometraje] = useState(
    ficha.kilometrajeIngreso === null ? "" : String(ficha.kilometrajeIngreso),
  );
  const [ubicacion, setUbicacion] = useState("");
  const [fechaIngreso, setFechaIngreso] = useState(hoyCivil());
  const [numLlaves, setNumLlaves] = useState("");

  // Parte II — quien entrega.
  const [propietarioNombre, setPropietarioNombre] = useState("");
  const [idTipo, setIdTipo] = useState("INE");
  const [idNumero, setIdNumero] = useState("");
  const [telefono, setTelefono] = useState("");
  const [domicilio, setDomicilio] = useState("");

  // Parte III — condiciones económicas de compra directa.
  const [precioCompra, setPrecioCompra] = useState("");
  const [compraFormaPago, setCompraFormaPago] = useState(formasPago[0]?.codigo ?? "");
  const [compraFechaPago, setCompraFechaPago] = useState("");

  // Parte III — condiciones económicas de consignación.
  const [precioMinimo, setPrecioMinimo] = useState("");
  const [modoComision, setModoComision] = useState<ModoComision>("MONTO");
  const [comisionMonto, setComisionMonto] = useState("");
  const [comisionPct, setComisionPct] = useState("");
  const [fechaLimite, setFechaLimite] = useState("");

  // El tipo de operación NO es una decisión de esta pantalla: lo dice el origen
  // del expediente, que es la única verdad sobre de quién es la unidad. Se usa
  // como constante, no como estado, para que ni siquiera exista la variable que
  // alguien pudiera cambiar.
  const esCompra = ficha.tipoOperacion === "COMPRA_DIRECTA";

  const telefonoValido = telefono === "" || /^[0-9]{10}$/.test(telefono);
  const kilometrajeValido =
    kilometraje === "" ||
    (/^\d+$/.test(kilometraje) && Number(kilometraje) <= MAXIMO_KILOMETRAJE_UNIDAD);
  const llavesValidas = numLlaves === "" || (/^\d+$/.test(numLlaves) && Number(numLlaves) <= 10);

  const comisionCapturada = modoComision === "MONTO" ? comisionMonto : comisionPct;
  const comisionValida =
    modoComision === "MONTO" ? esImporteNoNegativo(comisionMonto) : esPorcentajeValido(comisionPct);

  const economicosListos = esCompra
    ? esImportePositivo(precioCompra)
    : esImportePositivo(precioMinimo) && comisionValida;

  const listo =
    sucursalId !== "" &&
    propietarioNombre.trim().length >= 3 &&
    idTipo.trim().length >= 2 &&
    idNumero.trim().length >= 3 &&
    fechaIngreso !== "" &&
    telefonoValido &&
    kilometrajeValido &&
    llavesValidas &&
    economicosListos;

  async function guardar() {
    setGuardando(true);
    try {
      // 1) El folio primero: el consecutivo lo entrega la base, nunca la UI.
      const emision = await fetch("/api/finanzas/documentos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipo: "CACM-RCI-02", sucursalId: Number(sucursalId) }),
      });
      if (!emision.ok) throw new Error((await emision.json()).error ?? "No se pudo emitir el folio");
      const documento = await emision.json();

      // 2) El contenido. Los campos del bloque que no aplica ni se arman: la
      //    unión discriminada del servicio describe una operación o la otra, y
      //    un precio de compra dentro de una consigna no debería ni viajar.
      const economicos = esCompra
        ? {
            tipoOperacion: "COMPRA_DIRECTA",
            precioCompra,
            compraFormaPago: compraFormaPago || null,
            compraFechaPago: compraFechaPago || null,
          }
        : {
            tipoOperacion: "CONSIGNACION",
            precioMinimoVenta: precioMinimo,
            comisionMonto: modoComision === "MONTO" ? comisionMonto : null,
            comisionPct: modoComision === "PORCENTAJE" ? comisionPct : null,
            consignaFechaLimite: fechaLimite || null,
          };

      const captura = await fetch(`/api/finanzas/documentos/${documento.id}/rci02`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          // La ficha de la unidad no se reenvía: el servicio la resuelve desde
          // el expediente. Lo único que viaja es a cuál va anclado el folio.
          expedienteId: ficha.expedienteId,
          placas: placas || null,
          kilometraje: kilometraje === "" ? null : Number(kilometraje),
          ubicacionFisica: ubicacion || null,
          fechaIngreso,
          numLlaves: numLlaves === "" ? null : Number(numLlaves),
          propietarioNombre,
          propietarioIdTipo: idTipo,
          propietarioIdNumero: idNumero,
          propietarioTelefono: telefono || null,
          propietarioDomicilio: domicilio || null,
          ...economicos,
        }),
      });
      if (!captura.ok) throw new Error((await captura.json()).error ?? "No se pudo guardar");

      toast.success(`Folio ${documento.folio} capturado`);
      router.push(`/finanzas/documentos/${documento.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el ingreso");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            {/* Las tres partes llevan icono porque son las anclas con las que
                se recorre una hoja larga: la ficha, quién entrega y el dinero. */}
            <CardTitle className="flex items-center gap-2">
              <IconoSilk nombre="formulario" className="shrink-0" />
              Parte I · Datos del vehículo
            </CardTitle>
            <CardDescription>
              Marca, modelo, año y VIN vienen del expediente {ficha.numeroExpediente} y por eso no
              se teclean: si se volvieran a capturar, el folio y el expediente podrían acabar
              describiendo dos coches distintos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 rounded-md border bg-muted/40 p-4 text-sm sm:grid-cols-2">
              <Resuelto titulo="1. Marca / submarca / modelo / año">
                {ficha.marca} {ficha.modelo} {ficha.anio}
              </Resuelto>
              <Resuelto titulo="3. Color">{ficha.color ?? "sin registrar"}</Resuelto>
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">4. No. de serie (VIN)</p>
                <p className="mt-1 font-mono text-sm tracking-[0.3em]">
                  {casillasVin(ficha.vin)
                    .map((c) => c ?? "·")
                    .join(" ")}
                </p>
              </div>
              <Resuelto titulo="No. de motor">{ficha.numMotor ?? "sin registrar"}</Resuelto>
              <Resuelto titulo="Expediente">{ficha.numeroExpediente}</Resuelto>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="placas">2. No. de placas</Label>
                <Input
                  id="placas"
                  value={placas}
                  onChange={(e) => setPlacas(e.target.value.toUpperCase())}
                  maxLength={20}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="kilometraje">5. Kilometraje de ingreso</Label>
                <Input
                  id="kilometraje"
                  value={kilometraje}
                  onChange={(e) => setKilometraje(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  aria-invalid={!kilometrajeValido}
                />
                <p className="text-xs text-muted-foreground">
                  El expediente lo registró al día 0; aquí se confirma el odómetro con el que la
                  unidad entra al piso.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ubicacion">6. Ubicación física / lote</Label>
                <Input
                  id="ubicacion"
                  value={ubicacion}
                  onChange={(e) => setUbicacion(e.target.value)}
                  maxLength={160}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fecha-ingreso">7. Fecha de ingreso *</Label>
                <Input
                  id="fecha-ingreso"
                  type="date"
                  value={fechaIngreso}
                  onChange={(e) => setFechaIngreso(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="llaves">8. No. de llaves entregadas</Label>
                <Input
                  id="llaves"
                  value={numLlaves}
                  onChange={(e) => setNumLlaves(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  className="max-w-24"
                  aria-invalid={!llavesValidas}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="size-4 shrink-0" />
              Parte II · Quien entrega el vehículo y tipo de operación
            </CardTitle>
            <CardDescription>
              Los datos de quien entrega se toman de su identificación oficial, tal como se
              transcriben en el papel.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="propietario">9. Nombre completo o razón social *</Label>
              <Input
                id="propietario"
                value={propietarioNombre}
                onChange={(e) => setPropietarioNombre(e.target.value)}
                maxLength={200}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="id-tipo">10. Identificación oficial — tipo *</Label>
              <Input id="id-tipo" value={idTipo} onChange={(e) => setIdTipo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="id-numero">Número *</Label>
              <Input
                id="id-numero"
                value={idNumero}
                onChange={(e) => setIdNumero(e.target.value)}
                placeholder="al menos 3 caracteres"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="telefono">11. Teléfono</Label>
              <Input
                id="telefono"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value.replace(/\D/g, "").slice(0, 10))}
                inputMode="numeric"
                placeholder="10 dígitos"
                aria-invalid={!telefonoValido}
              />
              {!telefonoValido && (
                <p className="text-xs text-destructive">
                  El teléfono son 10 dígitos, sin espacios ni guiones.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="domicilio">12. Domicilio</Label>
              <Input
                id="domicilio"
                value={domicilio}
                onChange={(e) => setDomicilio(e.target.value)}
                maxLength={300}
              />
            </div>

            <Separator className="sm:col-span-2" />

            {/* 13. Tipo de operación. En el papel son dos casillas y quien llena
                marca una; aquí ya viene decidida por el origen del expediente,
                así que se presenta como dato resuelto. Ofrecer la otra opción
                sólo serviría para chocar contra el disparador que las compara. */}
            <div className="space-y-2 sm:col-span-2">
              <p className="text-sm font-medium">13. Tipo de operación</p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={esCompra ? "default" : "secondary"}>
                  {esCompra ? "a) Compra directa" : "b) Consignación"}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {esCompra
                    ? "La empresa adquiere la propiedad del vehículo desde este acto."
                    : "El vehículo permanece propiedad del consignante; la empresa sólo lo resguarda y lo vende por su cuenta."}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Lo decide el origen del expediente {ficha.numeroExpediente}, que dice que la unidad
                es <span className="font-medium">{ficha.origen.toLowerCase()}</span>. Si eso está
                mal, se corrige en el expediente y no aquí: es el único lugar donde consta de quién
                es el coche.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconoSilk nombre="peso" className="shrink-0" />
              Parte III · Condiciones económicas
            </CardTitle>
            <CardDescription>
              {esCompra
                ? "Se muestra sólo el bloque de compra directa. El de consignación no aplica a una unidad propia."
                : "Se muestra sólo el bloque de consignación. El de compra directa no aplica: la empresa no está comprando la unidad."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {esCompra ? (
              <>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="precio-compra">14. Precio de compra pactado *</Label>
                  <Input
                    id="precio-compra"
                    value={precioCompra}
                    onChange={(e) => setPrecioCompra(soloImporte(e.target.value))}
                    inputMode="decimal"
                    placeholder="0.00"
                    className="max-w-xs text-lg"
                  />
                  {esImportePositivo(precioCompra) && (
                    <p className="text-xs text-muted-foreground">
                      {importeEnCasillas(precioCompra).letra}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="forma-pago">15. Forma de pago</Label>
                  <select
                    id="forma-pago"
                    value={compraFormaPago}
                    onChange={(e) => setCompraFormaPago(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  >
                    <option value="">— sin especificar —</option>
                    {formasPago.map((f) => (
                      <option key={f.codigo} value={f.codigo}>
                        {f.etiqueta}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="fecha-pago">16. Fecha de pago</Label>
                  <Input
                    id="fecha-pago"
                    type="date"
                    value={compraFechaPago}
                    onChange={(e) => setCompraFechaPago(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="precio-minimo">
                    17. Precio mínimo de venta autorizado por el consignante *
                  </Label>
                  <Input
                    id="precio-minimo"
                    value={precioMinimo}
                    onChange={(e) => setPrecioMinimo(soloImporte(e.target.value))}
                    inputMode="decimal"
                    placeholder="0.00"
                    className="max-w-xs text-lg"
                  />
                  {esImportePositivo(precioMinimo) && (
                    <p className="text-xs text-muted-foreground">
                      {importeEnCasillas(precioMinimo).letra} · debajo de esta cifra la liquidación
                      lo señalará al calcular la utilidad.
                    </p>
                  )}
                </div>

                {/* 18. La comisión se pacta como monto O como porcentaje. El
                    CHECK de la tabla exige exactamente uno, así que la pantalla
                    presenta la elección primero y sólo deja teclear el que se
                    escogió: dos casillas abiertas invitan a llenar ambas. */}
                <div className="space-y-2 sm:col-span-2">
                  <p className="text-sm font-medium">
                    18. Comisión / margen pactado para la empresa *
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={modoComision === "MONTO" ? "default" : "outline"}
                      onClick={() => setModoComision("MONTO")}
                    >
                      Como monto fijo
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={modoComision === "PORCENTAJE" ? "default" : "outline"}
                      onClick={() => setModoComision("PORCENTAJE")}
                    >
                      Como porcentaje
                    </Button>
                  </div>

                  {modoComision === "MONTO" ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="comision-monto">Monto pactado</Label>
                      <Input
                        id="comision-monto"
                        value={comisionMonto}
                        onChange={(e) => setComisionMonto(soloImporte(e.target.value))}
                        inputMode="decimal"
                        placeholder="0.00"
                        className="max-w-xs"
                      />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label htmlFor="comision-pct">Porcentaje pactado</Label>
                      <Input
                        id="comision-pct"
                        value={comisionPct}
                        onChange={(e) => setComisionPct(e.target.value.replace(/[^\d.]/g, ""))}
                        inputMode="decimal"
                        placeholder="12.5"
                        className="max-w-24"
                        aria-invalid={comisionPct !== "" && !esPorcentajeValido(comisionPct)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Hasta dos decimales, mayor que cero y no más de 100.
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Se guarda una sola de las dos formas. Registrar monto y porcentaje a la vez
                    dejaría dos comisiones distintas para la misma unidad.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="fecha-limite">19. Plazo de consignación (fecha límite)</Label>
                  <Input
                    id="fecha-limite"
                    type="date"
                    value={fechaLimite}
                    onChange={(e) => setFechaLimite(e.target.value)}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconoSilk nombre="listado" className="shrink-0" />
              Resumen
            </CardTitle>
            <CardDescription>{ficha.marca} {ficha.modelo} {ficha.anio}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
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

            <div className="flex justify-between border-t pt-3">
              <span className="text-muted-foreground">Operación</span>
              <span className="font-medium">{esCompra ? "Compra directa" : "Consignación"}</span>
            </div>

            {esCompra ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Precio de compra</span>
                <span className="font-medium">
                  {importeEnCasillas(esImportePositivo(precioCompra) ? precioCompra : "0").texto}
                </span>
              </div>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Precio mínimo</span>
                  <span className="font-medium">
                    {importeEnCasillas(esImportePositivo(precioMinimo) ? precioMinimo : "0").texto}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Comisión</span>
                  <span className="font-medium">
                    {!comisionValida
                      ? "sin pactar"
                      : modoComision === "MONTO"
                        ? importeEnCasillas(comisionMonto).texto
                        : `${comisionCapturada} %`}
                  </span>
                </div>
              </>
            )}

            {!esCompra && (
              // El manual es explícito: la comisión mercantil no transmite la
              // propiedad. Decirlo en la pantalla de captura evita que la
              // unidad acabe contada como activo propio.
              <Alert>
                <IconoSilk nombre="aviso" />
                <AlertTitle>La unidad no pasa a ser de la empresa</AlertTitle>
                <AlertDescription>
                  Queda en resguardo de terceros: se exhibe y se vende por cuenta del consignante, y
                  al venderse hay que rendirle cuentas con un CACM-RCI-03.
                </AlertDescription>
              </Alert>
            )}

            <Button className="w-full" disabled={guardando || !listo} onClick={guardar}>
              <IconoSilk nombre="guardar" className="shrink-0" />
              {guardando ? "Guardando…" : "Emitir folio y guardar"}
            </Button>
            <p className="text-xs text-muted-foreground">
              El folio consecutivo lo entrega la base al guardar, no esta pantalla. Después podrás
              enviarlo a firma.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Resuelto({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="mt-0.5 font-medium">{children}</p>
    </div>
  );
}
