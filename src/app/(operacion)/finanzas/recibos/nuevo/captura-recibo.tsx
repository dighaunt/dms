"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { IconoSilk } from "@/components/iconos/silk";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InputMoneda } from "@/components/ui/input-moneda";
import { Label } from "@/components/ui/label";
import { aCentavos, deCentavos } from "@/lib/finanzas/calculos";
import { casillasVin, importeEnCasillas, vinEsValido } from "@/lib/finanzas/formato";

type Opcion = { id: number; nombre: string; clave?: string };
type Concepto = { codigo: string; etiqueta: string };

const DENOMINACIONES = ["1000", "500", "200", "100", "50", "20", "10", "5", "2", "1", "0.50"];

type Props = {
  sucursales: Opcion[];
  empleados: Opcion[];
  conceptos: Concepto[];
};

export function CapturaRecibo({ sucursales, empleados, conceptos }: Props) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);

  const [sucursalId, setSucursalId] = useState<string>(String(sucursales[0]?.id ?? ""));
  const [empleadoId, setEmpleadoId] = useState<string>(String(empleados[0]?.id ?? ""));
  const [idTipo, setIdTipo] = useState("INE");
  const [idNumero, setIdNumero] = useState("");
  const [cliente, setCliente] = useState("");
  const [vehiculo, setVehiculo] = useState("");
  const [vin, setVin] = useState("");
  const [folioVenta, setFolioVenta] = useState("");
  const [concepto, setConcepto] = useState(conceptos[0]?.codigo ?? "ENGANCHE");
  const [conceptoOtro, setConceptoOtro] = useState("");
  const [importe, setImporte] = useState("");
  const [piezas, setPiezas] = useState<Record<string, string>>({});

  const arqueo = useMemo(() => {
    let total = 0n;
    for (const [denominacion, cantidad] of Object.entries(piezas)) {
      const n = Number(cantidad);
      if (!Number.isInteger(n) || n <= 0) continue;
      const valor = aCentavos(denominacion);
      if (valor === null) continue;
      total += valor * BigInt(n);
    }
    return total;
  }, [piezas]);

  const declarado = aCentavos(importe) ?? 0n;
  const cuadra = declarado > 0n && arqueo === declarado;
  const diferencia = arqueo - declarado;

  const vinValido = vin === "" || vinEsValido(vin);

  async function guardar() {
    setGuardando(true);
    try {
      
      const emision = await fetch("/api/finanzas/documentos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipo: "CACM-RCI-01", sucursalId: Number(sucursalId) }),
      });
      if (!emision.ok) throw new Error((await emision.json()).error ?? "No se pudo emitir el folio");
      const documento = await emision.json();

      const captura = await fetch(`/api/finanzas/documentos/${documento.id}/rci01`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vendedorEmpleadoId: Number(empleadoId),
          vendedorIdTipo: idTipo,
          vendedorIdNumero: idNumero,
          clienteNombre: cliente,
          vehiculoDescripcion: vehiculo || null,
          vin: vin || null,
          fechaHoraCobro: new Date().toISOString(),
          folioVentaTexto: folioVenta || null,
          conceptoCodigo: concepto,
          conceptoOtro: concepto === "OTRO" ? conceptoOtro : null,
          importeTotal: importe,
          denominaciones: Object.entries(piezas)
            .filter(([, c]) => Number(c) > 0)
            .map(([denominacion, cantidad]) => ({ denominacion, cantidad: Number(cantidad) })),
        }),
      });
      if (!captura.ok) throw new Error((await captura.json()).error ?? "No se pudo guardar");

      toast.success(`Folio ${documento.folio} capturado`);
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
            <CardTitle className="flex items-center gap-2">
              <IconoSilk nombre="formulario" className="shrink-0" />
              Parte I · Operación y vendedor
            </CardTitle>
            <CardDescription>
              Los campos siguen el orden de la forma impresa, para que quien ya la usa no tenga que
              reaprender nada.
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
              <Label htmlFor="empleado">1. Vendedor *</Label>
              <select
                id="empleado"
                value={empleadoId}
                onChange={(e) => setEmpleadoId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {empleados.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="id-tipo">3. Identificación oficial — tipo *</Label>
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

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cliente">4. Cliente / comprador *</Label>
              <Input id="cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="vehiculo">5. Vehículo (marca / submarca / modelo)</Label>
              <Input id="vehiculo" value={vehiculo} onChange={(e) => setVehiculo(e.target.value)} />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="vin">7. No. de serie (VIN) — un carácter por casilla</Label>
              <Input
                id="vin"
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase().slice(0, 17))}
                className="font-mono tracking-[0.35em] uppercase"
                placeholder="17 caracteres"
                aria-invalid={!vinValido}
              />
              <p className="font-mono text-xs text-muted-foreground">
                {casillasVin(vin)
                  .map((c) => c ?? "·")
                  .join(" ")}
              </p>
              {!vinValido && (
                <p className="text-xs text-destructive">
                  Un VIN válido tiene 17 caracteres y no usa I, O ni Q.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="folio-venta">8. Folio de venta / contrato *</Label>
              <Input
                id="folio-venta"
                value={folioVenta}
                onChange={(e) => setFolioVenta(e.target.value)}
                placeholder="C-02-2026-0001"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="concepto">9. Concepto del cobro *</Label>
              <select
                id="concepto"
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {conceptos.map((c) => (
                  <option key={c.codigo} value={c.codigo}>
                    {c.etiqueta}
                  </option>
                ))}
              </select>
            </div>

            {concepto === "OTRO" && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="concepto-otro">Especifica el concepto *</Label>
                <Input
                  id="concepto-otro"
                  value={conceptoOtro}
                  onChange={(e) => setConceptoOtro(e.target.value)}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconoSilk nombre="monedas" className="shrink-0" />
              Parte II · Detalle del efectivo entregado (arqueo)
            </CardTitle>
            <CardDescription>
              Cuenta las piezas por denominación. La suma tiene que coincidir con el importe
              declarado o el recibo no se podrá firmar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="importe">10. Importe total entregado en efectivo *</Label>
              <InputMoneda
                id="importe"
                valor={importe}
                onValorChange={setImporte}
                placeholder="0.00"
                className="max-w-xs font-mono text-lg tabular-nums"
              />
              {declarado > 0n && (
                <p className="text-xs text-muted-foreground">
                  {importeEnCasillas(deCentavos(declarado)).letra}
                </p>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {DENOMINACIONES.map((d) => (
                <div key={d} className="flex items-center gap-3">
                  <span className="w-20 text-right font-mono text-sm">
                    ${Number(d).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </span>
                  <Input
                    type="number"
                    min={0}
                    value={piezas[d] ?? ""}
                    onChange={(e) => setPiezas({ ...piezas, [d]: e.target.value })}
                    className="h-8 w-24"
                    aria-label={`Piezas de ${d}`}
                  />
                  <span className="text-sm text-muted-foreground">
                    {Number(piezas[d]) > 0
                      ? importeEnCasillas(
                          deCentavos((aCentavos(d) ?? 0n) * BigInt(Number(piezas[d]))),
                        ).texto
                      : ""}
                  </span>
                </div>
              ))}
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
              Arqueo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Contado en billetes</span>
              <span className="font-medium">{importeEnCasillas(deCentavos(arqueo)).texto}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Declarado</span>
              <span className="font-medium">{importeEnCasillas(deCentavos(declarado)).texto}</span>
            </div>
            <div className="border-t pt-3">
              {declarado === 0n ? (
                <p className="text-muted-foreground">Captura el importe declarado.</p>
              ) : cuadra ? (
                
                <div className="flex items-center gap-2">
                  <IconoSilk nombre="correcto" className="shrink-0" />
                  <Badge className="flex-1 justify-center py-1">El arqueo cuadra</Badge>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <IconoSilk nombre="alerta" className="shrink-0" />
                    <Badge variant="destructive" className="flex-1 justify-center py-1">
                      Diferencia {importeEnCasillas(deCentavos(diferencia)).texto}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {diferencia > 0n
                      ? "Hay más billetes que el importe declarado."
                      : "Faltan billetes para llegar al importe declarado."}
                  </p>
                </div>
              )}
            </div>

            <Button
              className="w-full"
              disabled={guardando || !cuadra || !cliente || !idNumero || !folioVenta || !vinValido}
              onClick={guardar}
            >
              {guardando ? (
                "Guardando…"
              ) : (
                <>
                  <IconoSilk nombre="guardar" className="shrink-0" />
                  Emitir folio y guardar
                </>
              )}
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
