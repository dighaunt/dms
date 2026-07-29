"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { IconoSilk } from "@/components/iconos/silk";
import { Ayuda } from "@/components/ui/ayuda";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PinInput } from "@/components/ui/pin-input";

type Pendiente = {
  rol: string;
  etiqueta: string;
  obligatoria: boolean;
  exigeUsuarioInterno: boolean;
};

/**
 * Acciones sobre un folio: mandarlo a firma, firmarlo y cancelarlo.
 *
 * La firma pide el PIN de quien la pone, y ese PIN se coteja dentro de la
 * función SQL contra el hash del propio firmante. No basta con tener la sesión
 * abierta: es la diferencia entre que el custodio acepte el dinero y que
 * alguien acepte por él desde su misma computadora.
 */
export function AccionesDocumento({
  documentoId,
  estado,
  pendientes,
}: {
  documentoId: number;
  estado: string;
  pendientes: Pendiente[];
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [rol, setRol] = useState<string>(pendientes[0]?.rol ?? "");
  const [pin, setPin] = useState("");
  const [motivo, setMotivo] = useState("");

  // Datos del tercero, sólo cuando el rol elegido admite firma presencial.
  const elegido = pendientes.find((p) => p.rol === rol);
  const esExterno = elegido ? !elegido.exigeUsuarioInterno : false;
  const [nombre, setNombre] = useState("");
  const [idTipo, setIdTipo] = useState("INE");
  const [idNumero, setIdNumero] = useState("");

  async function llamar(url: string, cuerpo: unknown, exito: string) {
    setOcupado(true);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const datos = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(datos.error ?? "La operación no se completó");
      toast.success(exito);
      setPin("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "La operación no se completó");
    } finally {
      setOcupado(false);
    }
  }

  if (estado === "BORRADOR") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {/* El mismo icono con el que la cabecera marca el borrador. */}
            <IconoSilk nombre="nota" className="shrink-0" />
            Enviar a firma
            <Ayuda titulo="Hasta cuándo se puede corregir">
              Hasta que se firme, el documento se puede corregir. Después sólo admite un
              complementario.
            </Ayuda>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            disabled={ocupado}
            onClick={() =>
              llamar(
                `/api/finanzas/documentos/${documentoId}/estado`,
                { accion: "enviar-a-firma" },
                "El folio quedó pendiente de firma",
              )
            }
          >
            <IconoSilk nombre="editar" className="shrink-0" />
            Enviar a firma
          </Button>
          <div className="flex flex-1 gap-2">
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo para cancelar (mínimo 10 caracteres)"
            />
            <Button
              variant="outline"
              disabled={ocupado || motivo.trim().length < 10}
              onClick={() =>
                llamar(
                  `/api/finanzas/documentos/${documentoId}/estado`,
                  { accion: "cancelar", motivo },
                  "Folio cancelado; su número queda ocupado y explicado",
                )
              }
            >
              {/* Cancelar un folio es un hecho del negocio —el número queda
                  ocupado y explicado—, no la equis de cerrar un cuadro. */}
              <IconoSilk nombre="cancelar" className="shrink-0" />
              Cancelar folio
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (estado !== "PENDIENTE_DE_FIRMA") return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconoSilk nombre="editar" className="shrink-0" />
          Firmar
          <Ayuda titulo="Qué pasa cuando firman todos">
            Cada quien firma con su propio usuario y su propio PIN. Cuando no falte ninguna firma
            obligatoria, el documento queda cerrado e inalterable.
          </Ayuda>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="rol">Rol que vas a firmar</Label>
          <select
            id="rol"
            value={rol}
            onChange={(e) => setRol(e.target.value)}
            className="h-9 w-full max-w-md rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {pendientes.map((p) => (
              <option key={p.rol} value={p.rol}>
                {p.etiqueta}
                {p.obligatoria ? "" : " (opcional)"}
              </option>
            ))}
          </select>
        </div>

        {esExterno && (
          <div className="grid gap-3 rounded-md border p-4 sm:grid-cols-3">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground sm:col-span-3">
              Firma presencial de un tercero: tú la atestiguas con tu PIN.
              <Ayuda titulo="Por qué se pide tu PIN y no el suyo">
                Este rol lo firma un tercero que no tiene cuenta en el sistema. Su rúbrica se
                levanta de forma presencial y tú la atestiguas: es tu PIN el que se verifica,
                porque eres quien responde por el acto.
              </Ayuda>
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="t-nombre">Nombre del firmante</Label>
              <Input id="t-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-tipo">Identificación</Label>
              <Input id="t-tipo" value={idTipo} onChange={(e) => setIdTipo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-num">Número</Label>
              <Input id="t-num" value={idNumero} onChange={(e) => setIdNumero(e.target.value)} />
            </div>
          </div>
        )}

        {/* El hash del contenido no se manda desde aquí: lo calcula el
            servidor leyendo el documento, que es lo único que hace detectable
            una alteración posterior. */}
        <div className="space-y-1.5">
          <Label className="gap-1.5">
            <IconoSilk nombre="llave" className="shrink-0" />
            {esExterno ? "Tu PIN (atestiguas la firma)" : "Tu PIN de firma"}
          </Label>
          <PinInput valor={pin} onChange={setPin} disabled={ocupado} />
        </div>

        <Button
          disabled={ocupado || pin.length < 6 || (esExterno && (!nombre || !idNumero))}
          onClick={() =>
            llamar(
              `/api/finanzas/documentos/${documentoId}/firmas`,
              esExterno
                ? {
                    metodo: "AUTOGRAFA_PRESENCIAL",
                    rol,
                    nombre,
                    idTipo,
                    idNumero,
                    pinAtestigua: pin,
                  }
                : { rol, pin },
              "Firma registrada",
            )
          }
        >
          {/* La pluma, la misma de «Firmas» y «Enviar a firma»: firmar es el
              acto. El sello es lo que queda después, y por eso es el icono de
              la tarjeta «Sellos» y del verificador. */}
          <IconoSilk nombre="editar" className="shrink-0" />
          Firmar
        </Button>
      </CardContent>
    </Card>
  );
}
