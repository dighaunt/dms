"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { IconoSilk } from "@/components/iconos/silk";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { importeEnCasillas } from "@/lib/finanzas/formato";
import type { PanelReportes, RangoReporte } from "@/lib/finanzas/reportes";

type Sucursal = { id: number; clave: string; nombre: string; activa: boolean };

type Props = {
  sucursales: Sucursal[];
  filtro: RangoReporte;
  panel: PanelReportes;
  
  rangoInvalido: boolean;
};

const TODAS = "todas";

function dinero(monto: string): string {
  return importeEnCasillas(monto).texto;
}

function esCero(monto: string): boolean {
  return importeEnCasillas(monto).texto === "$0.00";
}

function SinDatos({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-md border border-dashed p-6 text-sm text-muted-foreground">
      {}
      <IconoSilk nombre="informacion" className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function Cifra({
  etiqueta,
  monto,
  detalle,
  tono,
}: {
  etiqueta: string;
  monto: string;
  detalle?: string;
  tono?: "grave" | "aviso";
}) {
  return (
    <div className="rounded-lg border p-4">
      {}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {tono === "grave" && <IconoSilk nombre="alerta" tamano={14} className="shrink-0" />}
        {tono === "aviso" && <IconoSilk nombre="advertencia" tamano={14} className="shrink-0" />}
        {etiqueta}
      </p>
      <p
        className={
          tono === "grave"
            ? "mt-1 text-xl font-semibold text-destructive"
            : tono === "aviso"
              ? "mt-1 text-xl font-semibold text-amber-600 dark:text-amber-500"
              : "mt-1 text-xl font-semibold"
        }
      >
        {dinero(monto)}
      </p>
      {detalle && <p className="mt-1 text-xs text-muted-foreground">{detalle}</p>}
    </div>
  );
}

export function PanelReportesUI({ sucursales, filtro, panel, rangoInvalido }: Props) {
  const router = useRouter();
  const [pendiente, iniciarTransicion] = useTransition();

  const [sucursal, setSucursal] = useState(
    filtro.sucursalId === null ? TODAS : String(filtro.sucursalId),
  );
  const [desde, setDesde] = useState(filtro.desde);
  const [hasta, setHasta] = useState(filtro.hasta);

  function aplicar() {
    const parametros = new URLSearchParams({ desde, hasta });
    if (sucursal !== TODAS) parametros.set("sucursal", sucursal);
    iniciarTransicion(() => router.push(`/finanzas/reportes?${parametros.toString()}`));
  }

  const nombreSucursal =
    filtro.sucursalId === null
      ? "Todas las sucursales"
      : (sucursales.find((s) => s.id === filtro.sucursalId)?.nombre ?? "Sucursal");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconoSilk nombre="buscar" className="shrink-0" />
            Filtro
          </CardTitle>
          <CardDescription>
            {nombreSucursal} · del {filtro.desde} al {filtro.hasta}
            {rangoInvalido && " · el rango de la dirección no era válido y se usó el mes en curso"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(evento) => {
              evento.preventDefault();
              aplicar();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="sucursal">Sucursal</Label>
              <Select value={sucursal} onValueChange={setSucursal}>
                <SelectTrigger id="sucursal" className="w-[240px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS}>Todas las sucursales</SelectItem>
                  {sucursales.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.clave} · {s.nombre}
                      {!s.activa && " (dada de baja)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="desde">Desde</Label>
              <Input
                id="desde"
                type="date"
                value={desde}
                onChange={(evento) => setDesde(evento.target.value)}
                className="w-[170px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hasta">Hasta</Label>
              <Input
                id="hasta"
                type="date"
                value={hasta}
                onChange={(evento) => setHasta(evento.target.value)}
                className="w-[170px]"
              />
            </div>

            <Button type="submit" disabled={pendiente}>
              {pendiente ? "Actualizando…" : "Aplicar"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Tabs defaultValue="ingresos">
        {}
        <TabsList className="flex-wrap">
          <TabsTrigger value="ingresos">
            <IconoSilk nombre="dinero" className="shrink-0" />
            Ingresos
          </TabsTrigger>
          <TabsTrigger value="egresos">
            <IconoSilk nombre="nota" className="shrink-0" />
            Egresos
          </TabsTrigger>
          <TabsTrigger value="diferencias">
            <IconoSilk nombre="riesgo" className="shrink-0" />
            Diferencias de caja
          </TabsTrigger>
          <TabsTrigger value="posicion">
            <IconoSilk nombre="monedas" className="shrink-0" />
            Posición de efectivo
          </TabsTrigger>
          <TabsTrigger value="socios">
            <IconoSilk nombre="pastel" className="shrink-0" />
            Utilidades por repartir
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ingresos" className="mt-4">
          <Ingresos datos={panel.ingresos} />
        </TabsContent>
        <TabsContent value="egresos" className="mt-4">
          <Egresos datos={panel.egresos} />
        </TabsContent>
        <TabsContent value="diferencias" className="mt-4">
          <Diferencias datos={panel.diferencias} />
        </TabsContent>
        <TabsContent value="posicion" className="mt-4">
          <Posicion datos={panel.posicion} />
        </TabsContent>
        <TabsContent value="socios" className="mt-4">
          <Socios datos={panel.socios} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Ingresos({ datos }: { datos: PanelReportes["ingresos"] }) {
  const { consignacion } = datos;
  const hayConsignas = consignacion.liquidaciones > 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconoSilk nombre="dinero" className="shrink-0" />
            Ingresos por tipo
          </CardTitle>
          <CardDescription>
            Ventas de contado (RCI-01), utilidad neta de consignas (RCI-03) e ingresos por servicio
            (RCI-04), sólo de folios firmados. La columna «en efectivo» es la que engordó el cajón
            y cuadra con el corte diario; el resto entró por banco o tarjeta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {datos.renglones.length === 0 ? (
            <SinDatos>
              No hay ningún ingreso firmado en este periodo. Puede ser que no haya habido
              operaciones, o que los recibos del periodo sigan en borrador o esperando firmas: un
              documento sin firmar todavía no es un ingreso de la empresa.
            </SinDatos>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Concepto</TableHead>
                    <TableHead className="text-right">Folios</TableHead>
                    <TableHead className="text-right">En efectivo</TableHead>
                    <TableHead className="text-right">Otras formas</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {datos.renglones.map((renglon) => (
                    <TableRow key={renglon.concepto}>
                      <TableCell>
                        <span className="font-medium">{renglon.etiqueta}</span>{" "}
                        <Badge variant="outline" className="font-mono">
                          {renglon.tipoCodigo}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{renglon.documentos}</TableCell>
                      <TableCell className="text-right">{dinero(renglon.importeEfectivo)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {dinero(renglon.importeOtrasFormas)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {dinero(renglon.importe)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell>Total de ingresos</TableCell>
                    <TableCell className="text-right">{datos.documentos}</TableCell>
                    <TableCell className="text-right">{dinero(datos.totalEfectivo)}</TableCell>
                    <TableCell className="text-right">{dinero(datos.totalOtrasFormas)}</TableCell>
                    <TableCell className="text-right">{dinero(datos.total)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <IconoSilk nombre="monedas" className="shrink-0" />
            Ventas en consignación
            <Badge variant="secondary">{consignacion.etiquetaResguardo}</Badge>
          </CardTitle>
          <CardDescription>
            De una consigna la empresa gana únicamente la utilidad neta. El precio de venta y el
            monto del consignante son dinero de un tercero que sólo pasó por tesorería, y la unidad
            jamás formó parte del inventario propio.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hayConsignas ? (
            <SinDatos>
              No se firmó ninguna liquidación de consigna en este periodo.
            </SinDatos>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Cifra
                etiqueta="Precio de venta cobrado"
                monto={consignacion.precioVentaTotal}
                detalle={`${consignacion.liquidaciones} liquidación(es) · no es ingreso de la empresa`}
              />
              <Cifra
                etiqueta="Entregado al consignante"
                monto={consignacion.montoConsignanteTotal}
                detalle={consignacion.etiquetaResguardo}
              />
              <Cifra etiqueta="Gastos recuperados" monto={consignacion.gastosTotal} />
              <Cifra
                etiqueta="Utilidad neta de la empresa"
                monto={consignacion.utilidadNetaTotal}
                detalle="Lo único que sí es ingreso"
                tono={consignacion.conUtilidadNegativa > 0 ? "aviso" : undefined}
              />
            </div>
          )}
          {consignacion.conUtilidadNegativa > 0 && (
            <p className="mt-3 text-sm text-amber-600 dark:text-amber-500">
              {consignacion.conUtilidadNegativa} consigna(s) cerraron con utilidad negativa: los
              gastos se comieron el margen. Vale la pena revisar esas liquidaciones.
            </p>
          )}
        </CardContent>
      </Card>

      <PorSucursal titulo="Ingresos por sucursal" filas={datos.porSucursal} />
    </div>
  );
}

function PorSucursal({
  titulo,
  filas,
}: {
  titulo: string;
  filas: { sucursalId: number; clave: string; nombre: string; documentos: number; importe: string }[];
}) {
  if (filas.length < 2) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconoSilk nombre="sucursal" className="shrink-0" />
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sucursal</TableHead>
                <TableHead className="text-right">Folios</TableHead>
                <TableHead className="text-right">Importe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((fila) => (
                <TableRow key={fila.sucursalId}>
                  <TableCell>
                    <span className="font-mono">{fila.clave}</span> · {fila.nombre}
                  </TableCell>
                  <TableCell className="text-right">{fila.documentos}</TableCell>
                  <TableCell className="text-right font-semibold">{dinero(fila.importe)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function Egresos({ datos }: { datos: PanelReportes["egresos"] }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconoSilk nombre="nota" className="shrink-0" />
            Egresos por tipo
          </CardTitle>
          <CardDescription>
            Vales de egreso (RCI-05) firmados, agrupados por concepto: nómina, comisiones, retiros
            de socios, proveedores y gastos. La nómina se cuenta por su vale y nunca por el recibo
            del trabajador (RCI-06): sumar los dos duplicaría cada pago.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {datos.renglones.length === 0 ? (
            <SinDatos>
              No hay ningún vale de egreso firmado en este periodo. Recuerda que ningún efectivo
              puede salir de caja sin un vale firmado por tres personas distintas: si hubo salidas
              y no aparecen aquí, es que sus vales siguen sin firma.
            </SinDatos>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Concepto</TableHead>
                    <TableHead className="text-right">Vales</TableHead>
                    <TableHead className="text-right">En efectivo</TableHead>
                    <TableHead className="text-right">Otras formas</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {datos.renglones.map((renglon) => (
                    <TableRow key={renglon.conceptoCodigo}>
                      <TableCell>
                        <span className="font-medium">{renglon.etiqueta}</span>
                        {renglon.esAnticipoUtilidades && (
                          <Badge variant="secondary" className="ml-2">
                            Anticipo a cuenta, no gasto
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{renglon.documentos}</TableCell>
                      <TableCell className="text-right">{dinero(renglon.importeEfectivo)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {dinero(renglon.importeOtrasFormas)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {dinero(renglon.importe)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell>Total de egresos</TableCell>
                    <TableCell className="text-right">{datos.documentos}</TableCell>
                    <TableCell className="text-right">{dinero(datos.totalEfectivo)}</TableCell>
                    <TableCell className="text-right">{dinero(datos.totalOtrasFormas)}</TableCell>
                    <TableCell className="text-right">{dinero(datos.total)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}

          {!esCero(datos.totalAnticipoUtilidades) && (
            <p className="mt-4 text-sm">
              De ese total, <strong>{dinero(datos.totalAnticipoUtilidades)}</strong> son retiros de
              socios. No son gasto de la empresa: son anticipo a cuenta de utilidades hasta que un
              balance formal los respalde (LGSM art. 19). El detalle por socio está en la pestaña
              «Utilidades por repartir».
            </p>
          )}
        </CardContent>
      </Card>

      <PorSucursal titulo="Egresos por sucursal" filas={datos.porSucursal} />
    </div>
  );
}

function Diferencias({ datos }: { datos: PanelReportes["diferencias"] }) {
  if (datos.cortesFirmados === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconoSilk nombre="riesgo" className="shrink-0" />
            Diferencias de caja
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SinDatos>
            No hay ningún corte de caja firmado en este periodo, así que no hay arqueos que
            comparar. Mientras un corte no esté firmado, su diferencia todavía puede cambiar: el
            corte se rearma cada vez que se corrige algo.
          </SinDatos>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconoSilk nombre="riesgo" className="shrink-0" />
            Diferencias de caja
          </CardTitle>
          <CardDescription>
            Toda diferencia se explica o el día no cierra. Se muestran también los cortes que
            cuadraron: sin ese denominador, «tres faltantes» no significa nada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Cortes firmados</p>
              <p className="mt-1 text-xl font-semibold">{datos.cortesFirmados}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {datos.cortesConDiferencia} con diferencia
              </p>
            </div>
            <Cifra
              etiqueta="Faltantes acumulados"
              monto={datos.totalFaltante}
              tono={esCero(datos.totalFaltante) ? undefined : "grave"}
            />
            <Cifra
              etiqueta="Sobrantes acumulados"
              monto={datos.totalSobrante}
              tono={esCero(datos.totalSobrante) ? undefined : "aviso"}
            />
            <Cifra
              etiqueta="Neto del periodo"
              monto={datos.neto}
              detalle="Negativo significa que los faltantes no se compensaron"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <PatronCard titulo="Patrón por sucursal" filas={datos.porSucursal} />
        <PatronCard titulo="Patrón por custodio" filas={datos.porCustodio} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconoSilk nombre="tabla" className="shrink-0" />
            Corte por corte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Sucursal</TableHead>
                  <TableHead>Custodio</TableHead>
                  <TableHead className="text-right">Debía haber</TableHead>
                  <TableHead className="text-right">Contado</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                  <TableHead>Explicación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datos.cortes.map((corte) => (
                  <TableRow key={corte.documentoId}>
                    <TableCell className="whitespace-nowrap">
                      {corte.fechaCorte}
                      {corte.turno && (
                        <span className="ml-1 text-xs text-muted-foreground">{corte.turno}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono">{corte.sucursalClave}</TableCell>
                    <TableCell>{corte.custodioNombre}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {dinero(corte.saldoCalculado)}
                    </TableCell>
                    <TableCell className="text-right">{dinero(corte.efectivoContado)}</TableCell>
                    <TableCell
                      className={
                        corte.cuadra
                          ? "text-right"
                          : corte.esFaltante
                            ? "text-right font-semibold text-destructive"
                            : "text-right font-semibold text-amber-600 dark:text-amber-500"
                      }
                    >
                      {corte.cuadra ? "Cuadró" : dinero(corte.diferencia)}
                    </TableCell>
                    <TableCell className="max-w-[280px] text-sm text-muted-foreground">
                      {corte.cuadra
                        ? "—"
                        : (corte.explicacion ?? "Sin explicación registrada")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PatronCard({
  titulo,
  filas,
}: {
  titulo: string;
  filas: PanelReportes["diferencias"]["porSucursal"];
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        {}
        <CardTitle className="flex items-center gap-2">
          <IconoSilk nombre="tendencia" className="shrink-0" />
          {titulo}
        </CardTitle>
        <CardDescription>Ordenado de mayor a menor faltante acumulado.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quién</TableHead>
                <TableHead className="text-right">Cortes</TableHead>
                <TableHead className="text-right">Faltantes</TableHead>
                <TableHead className="text-right">Sobrantes</TableHead>
                <TableHead className="text-right">Neto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((fila) => (
                <TableRow key={fila.clave}>
                  <TableCell>
                    {fila.nombre}
                    {fila.sinExplicacion > 0 && (
                      <Badge variant="outline" className="ml-2">
                        {fila.sinExplicacion} sin explicar
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{fila.cortes}</TableCell>
                  <TableCell className="text-right">
                    {fila.faltantes > 0 ? (
                      <span className="text-destructive">
                        {fila.faltantes} · {dinero(fila.totalFaltante)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {fila.sobrantes > 0 ? `${fila.sobrantes} · ${dinero(fila.totalSobrante)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right font-semibold">{dinero(fila.neto)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function Posicion({ datos }: { datos: PanelReportes["posicion"] }) {
  const conCorte = datos.sucursales.filter((s) => s.corteDocumentoId !== null);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconoSilk nombre="monedas" className="shrink-0" />
            ¿Dónde está el dinero?
          </CardTitle>
          <CardDescription>
            Efectivo en caja física frente a lo depositado en banco, al último corte firmado de cada
            sucursal con fecha hasta {datos.corteHasta}. No incluye inventario: las unidades en
            consignación no son de la empresa y las propias no son efectivo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {conCorte.length === 0 ? (
            <SinDatos>
              Ninguna sucursal tiene un corte de caja firmado con fecha hasta {datos.corteHasta}, y
              sin corte firmado nadie ha rendido cuentas todavía de dónde está el efectivo. La
              posición se arma con esa rendición, no con una consulta a los folios sueltos.
            </SinDatos>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Cifra etiqueta="En caja física" monto={datos.totales.cajaFisica} />
                <Cifra etiqueta="Depositado en banco" monto={datos.totales.banco} />
                <Cifra etiqueta="En tránsito / por depositar" monto={datos.totales.transito} />
                <Cifra etiqueta="Otro resguardo" monto={datos.totales.otro} />
                <Cifra etiqueta="Total ubicado" monto={datos.totales.total} />
              </div>

              {datos.fechasDeCorte.length > 1 && (
                <p className="text-sm text-amber-600 dark:text-amber-500">
                  Este consolidado suma fotografías tomadas en días distintos (
                  {datos.fechasDeCorte.join(", ")}). No es el saldo de la empresa «hoy», sino la
                  suma de la última rendición de cuentas disponible de cada sucursal.
                </p>
              )}

              {datos.sucursalesSinCorte.length > 0 && (
                <p className="text-sm text-destructive">
                  Sin corte firmado en el periodo: {datos.sucursalesSinCorte.join(", ")}. Una
                  sucursal que lleva días sin cerrar es el hallazgo más importante de este reporte,
                  no una fila vacía.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {conCorte.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconoSilk nombre="sucursal" className="shrink-0" />
              Por sucursal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sucursal</TableHead>
                    <TableHead>Último corte firmado</TableHead>
                    <TableHead className="text-right">Caja física</TableHead>
                    <TableHead className="text-right">Banco</TableHead>
                    <TableHead className="text-right">Tránsito</TableHead>
                    <TableHead className="text-right">Otro</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {datos.sucursales.map((sucursal) => (
                    <TableRow key={sucursal.sucursalId}>
                      <TableCell>
                        <span className="font-mono">{sucursal.clave}</span> · {sucursal.nombre}
                      </TableCell>
                      <TableCell>
                        {sucursal.corteDocumentoId === null ? (
                          <span className="text-destructive">Sin corte firmado</span>
                        ) : (
                          <span className="text-sm">
                            <span className="font-mono">{sucursal.folio}</span> ·{" "}
                            {sucursal.fechaCorte}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{dinero(sucursal.cajaFisica)}</TableCell>
                      <TableCell className="text-right">{dinero(sucursal.banco)}</TableCell>
                      <TableCell className="text-right">{dinero(sucursal.transito)}</TableCell>
                      <TableCell className="text-right">{dinero(sucursal.otro)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {dinero(sucursal.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconoSilk nombre="dinero" className="shrink-0" />
            Cuentas bancarias
          </CardTitle>
          <CardDescription>
            Depósitos declarados en el último corte firmado de cada sucursal, consolidados por
            institución y cuenta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {datos.cuentas.length === 0 ? (
            <SinDatos>
              No se declaró ningún depósito bancario en los cortes considerados: todo el efectivo
              quedó en caja o en resguardo.
            </SinDatos>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Institución</TableHead>
                    <TableHead>Cuenta</TableHead>
                    <TableHead className="text-right">Depósitos</TableHead>
                    <TableHead>Último</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {datos.cuentas.map((cuenta) => (
                    <TableRow key={`${cuenta.institucion}|${cuenta.cuenta}`}>
                      <TableCell>{cuenta.institucion}</TableCell>
                      <TableCell className="font-mono">{cuenta.cuenta}</TableCell>
                      <TableCell className="text-right">{cuenta.depositos}</TableCell>
                      <TableCell>{cuenta.ultimaFecha ?? "—"}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {dinero(cuenta.monto)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Socios({ datos }: { datos: PanelReportes["socios"] }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconoSilk nombre="pastel" className="shrink-0" />
            Utilidades pendientes de reparto
          </CardTitle>
          <CardDescription>
            Lo retirado por cada socio frente a lo que un reparto formal respalda. Mientras no
            exista un balance que arroje utilidades repartibles, todo retiro es anticipo a cuenta:
            saldo por comprobar, nunca gasto cerrado (LGSM art. 19).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {datos.socios.length === 0 ? (
            <SinDatos>
              Ningún socio ha retirado utilidades y no hay repartos formales registrados. Nada que
              comprobar.
            </SinDatos>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Cifra etiqueta="Retirado como anticipo" monto={datos.totalAnticipos} />
                <Cifra etiqueta="Respaldado por reparto formal" monto={datos.totalRepartido} />
                <Cifra
                  etiqueta="Saldo por comprobar"
                  monto={datos.totalPorComprobar}
                  detalle={`${datos.sociosConSaldo} socio(s) con saldo`}
                  tono={esCero(datos.totalPorComprobar) ? undefined : "aviso"}
                />
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Socio</TableHead>
                      <TableHead className="text-right">Anticipos</TableHead>
                      <TableHead className="text-right">Repartido</TableHead>
                      <TableHead className="text-right">Por comprobar</TableHead>
                      <TableHead className="text-right">Retirado en el periodo</TableHead>
                      <TableHead>Situación</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {datos.socios.map((socio) => (
                      <TableRow key={socio.socioId}>
                        <TableCell className="font-medium">{socio.nombre}</TableCell>
                        <TableCell className="text-right">{dinero(socio.totalAnticipos)}</TableCell>
                        <TableCell className="text-right">{dinero(socio.totalRepartido)}</TableCell>
                        <TableCell
                          className={
                            socio.tieneSaldoPorComprobar
                              ? "text-right font-semibold text-amber-600 dark:text-amber-500"
                              : "text-right"
                          }
                        >
                          {dinero(socio.saldoPorComprobar)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {socio.valesEnPeriodo === 0
                            ? "—"
                            : `${dinero(socio.retiradoEnPeriodo)} · ${socio.valesEnPeriodo} vale(s)`}
                        </TableCell>
                        <TableCell className="text-sm">
                          <Badge variant={socio.tieneSaldoPorComprobar ? "secondary" : "outline"}>
                            {socio.etiqueta}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Separator />
              <p className="text-xs text-muted-foreground">
                Los anticipos y el saldo por comprobar son acumulados históricos, no del rango
                elegido: son una cuenta corriente entre el socio y la empresa, y recortarla por
                fechas mostraría como saldado a quien retiró antes del periodo. La única columna
                que respeta el filtro es «retirado en el periodo».
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconoSilk nombre="listado" className="shrink-0" />
            Repartos formales registrados
          </CardTitle>
          <CardDescription>
            El balance y el acta que convierten un anticipo en utilidad efectivamente repartida.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {datos.repartos.length === 0 ? (
            <SinDatos>
              No hay ningún reparto formal registrado. Todo lo retirado por los socios sigue siendo
              anticipo a cuenta de utilidades y así debe presentarse en cualquier estado que se
              entregue a un tercero.
            </SinDatos>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ejercicio</TableHead>
                    <TableHead>Fecha del balance</TableHead>
                    <TableHead>Acta</TableHead>
                    <TableHead className="text-right">Utilidad repartible</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {datos.repartos.map((reparto) => (
                    <TableRow key={reparto.id}>
                      <TableCell className="font-mono">{reparto.ejercicio}</TableCell>
                      <TableCell>{reparto.fechaBalance}</TableCell>
                      <TableCell>{reparto.actaReferencia}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {dinero(reparto.utilidadRepartible)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
