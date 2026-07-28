"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HandshakeIcon, UserMinusIcon, UserPlusIcon } from "lucide-react";

import { IconoSilk } from "@/components/iconos/silk";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { patchJson, postJson } from "@/lib/cliente-api";
import { aCentavos, deCentavos } from "@/lib/finanzas/calculos";
import { importeEnCasillas } from "@/lib/finanzas/formato";

export type SocioEnPantalla = {
  personaId: number;
  nombre: string;
  /** Puede no estar: hay sociedades en las que el porcentaje no se lleva aquí. */
  participacionPct: string | null;
  actaReferencia: string;
  fechaAlta: string;
  fechaBaja: string | null;
  activo: boolean;
  /** Lo retirado con vales RCI-05 ya firmados. */
  totalAnticipos: string;
  /** Lo que los repartos formales ya le respaldaron. */
  totalRepartido: string;
  saldoPorComprobar: string;
  tieneSaldoPorComprobar: boolean;
  /** Redactada por `posicionSocio`; null si nunca retiró ni recibió reparto. */
  etiquetaPosicion: string | null;
};

export type PersonaCandidata = {
  id: number;
  nombre: string;
  categoria: string;
};

/** Cien por ciento, en centésimas enteras. El capital se reparte una sola vez. */
const CIEN_POR_CIENTO = 10_000n;

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Sólo dígitos y hasta dos decimales; el porcentaje es numeric(5,2). */
function soloPorcentaje(valor: string): string {
  const limpio = valor.replace(/[^\d.]/g, "");
  const partes = limpio.split(".");
  return partes.length <= 2 ? limpio : `${partes[0]}.${partes.slice(1).join("")}`;
}

export function PanelSocios({
  socios,
  personas,
  puedeAdministrar,
  hayPersonas,
}: {
  socios: SocioEnPantalla[];
  personas: PersonaCandidata[];
  puedeAdministrar: boolean;
  hayPersonas: boolean;
}) {
  const router = useRouter();

  const [personaId, setPersonaId] = useState("");
  const [participacion, setParticipacion] = useState("");
  const [acta, setActa] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);

  const [dandoDeBaja, setDandoDeBaja] = useState<SocioEnPantalla | null>(null);
  const [fechaBaja, setFechaBaja] = useState(hoy());

  const vigentes = useMemo(() => socios.filter((socio) => socio.activo), [socios]);

  /**
   * Cuánto del capital está repartido entre los socios vigentes.
   *
   * Se suma en centésimas enteras, igual que el dinero en centavos: sumar
   * porcentajes como Number es la manera de que 33.33 tres veces no den 99.99.
   * La base impide PASARSE de 100 con un disparador; quedarse corto es
   * legítimo —hay capital sin asignar, o participaciones que no se llevan
   * aquí— y por eso esto es un aviso y no un candado.
   */
  const reparticion = useMemo(() => {
    let asignado = 0n;
    let sinPorcentaje = 0;
    for (const socio of vigentes) {
      if (socio.participacionPct === null) {
        sinPorcentaje += 1;
        continue;
      }
      const centesimas = aCentavos(socio.participacionPct);
      if (centesimas === null) continue;
      asignado += centesimas;
    }
    return {
      asignado,
      sinPorcentaje,
      falta: asignado < CIEN_POR_CIENTO ? CIEN_POR_CIENTO - asignado : 0n,
    };
  }, [vigentes]);

  const participacionCentesimas = participacion.trim() === "" ? null : aCentavos(participacion);
  const participacionInvalida = participacion.trim() !== "" && participacionCentesimas === null;
  const participacionFueraDeRango =
    participacionCentesimas !== null &&
    (participacionCentesimas <= 0n || participacionCentesimas > CIEN_POR_CIENTO);
  const excederiaElCapital =
    participacionCentesimas !== null &&
    reparticion.asignado + participacionCentesimas > CIEN_POR_CIENTO;

  const listo =
    personaId !== "" &&
    acta.trim().length >= 3 &&
    !participacionInvalida &&
    !participacionFueraDeRango &&
    !excederiaElCapital;

  async function darDeAlta() {
    setOcupado("alta");
    try {
      const creado = await postJson<{ nombre?: string }>("/api/finanzas/catalogos/socios", {
        personaId: Number(personaId),
        // El porcentaje viaja como cadena, igual que todo lo que la base guarda
        // en numeric: convertirlo a Number aquí ya redondearía mal un 33.33.
        participacionPct: participacion.trim() === "" ? null : participacion.trim(),
        actaReferencia: acta.trim(),
      });
      if (!creado) return;
      toast.success(
        `${creado.nombre ?? "El socio"} quedó registrado; ya puede aparecer en un retiro de utilidades`,
      );
      setPersonaId("");
      setParticipacion("");
      setActa("");
      router.refresh();
    } finally {
      setOcupado(null);
    }
  }

  async function confirmarBaja() {
    if (!dandoDeBaja) return;
    setOcupado(`baja-${dandoDeBaja.personaId}`);
    try {
      const actualizado = await patchJson<{ activo?: boolean }>(
        `/api/finanzas/catalogos/socios/${dandoDeBaja.personaId}`,
        { fechaBaja },
      );
      if (!actualizado) return;
      toast.success(
        `${dandoDeBaja.nombre} deja de figurar como socio vigente; no podrá retirar utilidades`,
      );
      setDandoDeBaja(null);
      router.refresh();
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <HandshakeIcon className="size-4 shrink-0" />
            Socios
            {vigentes.length > 0 && <Badge variant="outline">{vigentes.length} vigentes</Badge>}
          </CardTitle>
          <CardDescription>
            Lo retirado son los vales de egreso FIRMADOS con concepto de retiro; lo respaldado, lo
            que un reparto formal ya le asignó. La diferencia es el saldo por comprobar: dinero que
            el socio debe a la sociedad hasta que un balance aprobado lo convierta en utilidad
            (LGSM art. 19).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {socios.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay ningún socio registrado. Mientras no lo haya, el vale de egreso no
              admite un retiro de utilidades: no habría a quién cargarle el anticipo.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Socio</TableHead>
                    <TableHead className="text-right">Participación</TableHead>
                    <TableHead className="text-right">Retirado</TableHead>
                    <TableHead className="text-right">Respaldado</TableHead>
                    <TableHead className="text-right">Por comprobar</TableHead>
                    <TableHead>Situación</TableHead>
                    {puedeAdministrar && <TableHead className="text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {socios.map((socio) => (
                    <TableRow key={socio.personaId} className={socio.activo ? undefined : "opacity-60"}>
                      <TableCell>
                        <span className="font-medium">{socio.nombre}</span>
                        <span className="block text-xs text-muted-foreground">
                          {socio.actaReferencia}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Alta {socio.fechaAlta}
                          {socio.fechaBaja ? ` · baja ${socio.fechaBaja}` : ""}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {socio.participacionPct === null ? "—" : `${socio.participacionPct}%`}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {importeEnCasillas(socio.totalAnticipos).texto}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {importeEnCasillas(socio.totalRepartido).texto}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold tabular-nums">
                        {importeEnCasillas(socio.saldoPorComprobar).texto}
                      </TableCell>
                      <TableCell className="space-y-1">
                        <Badge variant={socio.tieneSaldoPorComprobar ? "destructive" : "secondary"}>
                          {socio.etiquetaPosicion ?? "Sin movimientos"}
                        </Badge>
                        {!socio.activo && (
                          <Badge variant="outline" className="block w-fit">
                            Dado de baja
                          </Badge>
                        )}
                      </TableCell>
                      {puedeAdministrar && (
                        <TableCell className="text-right">
                          {socio.activo && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={ocupado !== null}
                              onClick={() => {
                                setDandoDeBaja(socio);
                                setFechaBaja(hoy());
                              }}
                            >
                              Dar de baja
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* La base impide pasarse de 100; quedarse corto es legítimo y sólo
              merece que se vea. Un reparto calculado sobre porcentajes que no
              suman lo que se cree reparte dinero que no corresponde. */}
          {vigentes.length > 0 && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p>
                Participación asignada:{" "}
                <span className="font-mono font-medium tabular-nums">
                  {deCentavos(reparticion.asignado)}%
                </span>{" "}
                de 100
              </p>
              {reparticion.falta > 0n && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Quedan {deCentavos(reparticion.falta)} puntos sin asignar. Es válido —puede haber
                  capital sin colocar— pero conviene revisarlo antes de calcular un reparto sobre
                  estos porcentajes.
                </p>
              )}
              {reparticion.sinPorcentaje > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {reparticion.sinPorcentaje} socio(s) vigente(s) sin participación registrada, así
                  que esta suma no es toda la verdad: no se puede saber cuánto les toca.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {!puedeAdministrar ? (
        <Alert>
          <IconoSilk nombre="candado" />
          <AlertTitle>El registro de socios lo lleva la administración global</AlertTitle>
          <AlertDescription>
            Asentar quién es dueño de parte de la empresa no es capturar una operación: se acredita
            con un acta y decide quién puede retirar utilidades. Por eso queda reservado al nivel
            N3. Aquí puedes consultar la posición de cada socio.
          </AlertDescription>
        </Alert>
      ) : !hayPersonas ? (
        <Alert>
          <IconoSilk nombre="aviso" />
          <AlertTitle>Primero hace falta la persona</AlertTitle>
          <AlertDescription>
            Un socio se registra sobre una persona del catálogo —así el accionista no necesita
            cuenta en el sistema para existir aquí—.{" "}
            <Link href="/finanzas/catalogos/personas" className="underline">
              Da de alta a la persona
            </Link>{" "}
            y vuelve a esta pantalla.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlusIcon className="size-4 shrink-0" />
              Dar de alta a un socio
            </CardTitle>
            <CardDescription>
              Se registra sobre una persona del catálogo, no sobre un usuario del sistema: el
              accionista rara vez opera el DMS. Si esa persona además tiene cuenta, el enlace vive
              en su ficha y no cambia nada de esto.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="socio-persona">Persona *</Label>
                <Select value={personaId} onValueChange={setPersonaId}>
                  <SelectTrigger id="socio-persona" className="w-full">
                    <SelectValue placeholder="Elige a quién se registra como socio" />
                  </SelectTrigger>
                  <SelectContent>
                    {personas.map((persona) => (
                      <SelectItem key={persona.id} value={String(persona.id)}>
                        {persona.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Sólo aparecen las personas activas que todavía no son socios.{" "}
                  <Link href="/finanzas/catalogos/personas" className="underline">
                    Dar de alta a otra persona
                  </Link>
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="socio-participacion">Participación (%)</Label>
                <Input
                  id="socio-participacion"
                  value={participacion}
                  onChange={(e) => setParticipacion(soloPorcentaje(e.target.value))}
                  inputMode="decimal"
                  className="font-mono tabular-nums"
                  placeholder="opcional · 25.00"
                  aria-invalid={
                    participacionInvalida || participacionFueraDeRango || excederiaElCapital
                  }
                />
                {participacionInvalida || participacionFueraDeRango ? (
                  <p className="text-xs text-destructive">
                    Se escribe con dígitos y hasta dos decimales, y va entre 0 y 100.
                  </p>
                ) : excederiaElCapital ? (
                  <p className="text-xs text-destructive">
                    Los socios vigentes ya suman {deCentavos(reparticion.asignado)}%: con esta
                    participación el capital social se repartiría más de una vez, y la base lo
                    rechaza.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Puede quedar en blanco. Si se captura, la suma de los socios vigentes no puede
                    pasar de 100.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="socio-acta">Acta que lo acredita *</Label>
                <Input
                  id="socio-acta"
                  value={acta}
                  onChange={(e) => setActa(e.target.value)}
                  maxLength={200}
                  placeholder="Ej.: Acta constitutiva del 04/02/2019, cláusula sexta"
                />
                <p className="text-xs text-muted-foreground">
                  Un socio al que nadie puede acreditar con un acta no debería poder retirar
                  utilidades a cuenta de nada.
                </p>
              </div>
            </div>

            <Button disabled={ocupado !== null || !listo} onClick={darDeAlta}>
              <UserPlusIcon className="size-4 shrink-0" />
              {ocupado === "alta" ? "Registrando…" : "Registrar como socio"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={dandoDeBaja !== null}
        onOpenChange={(abierto) => {
          if (!abierto && ocupado === null) setDandoDeBaja(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserMinusIcon className="size-4 shrink-0" />
              Dar de baja a {dandoDeBaja?.nombre}
            </DialogTitle>
            <DialogDescription>
              Deja de figurar como socio vigente: no volverá a aparecer en un retiro de utilidades y
              la base rechazará cualquier vale nuevo a su nombre. Lo ya firmado no se toca —sus
              vales y sus repartos siguen explicando lo que pasó—.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fecha-baja">Fecha de la baja</Label>
              <Input
                id="fecha-baja"
                type="date"
                value={fechaBaja}
                onChange={(e) => setFechaBaja(e.target.value)}
                min={dandoDeBaja?.fechaAlta}
              />
              <p className="text-xs text-muted-foreground">
                No puede ser anterior a su alta ({dandoDeBaja?.fechaAlta}).
              </p>
            </div>

            {dandoDeBaja?.tieneSaldoPorComprobar && (
              <Alert variant="destructive">
                <IconoSilk nombre="alerta" />
                <AlertTitle>Se va debiendo comprobar dinero</AlertTitle>
                <AlertDescription>
                  {dandoDeBaja.nombre} tiene{" "}
                  {importeEnCasillas(dandoDeBaja.saldoPorComprobar).texto} por comprobar: retiros a
                  cuenta de utilidades que ningún reparto formal respalda todavía. La baja no borra
                  ese saldo ni lo cobra; sigue siendo una cuenta pendiente entre esa persona y la
                  sociedad.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              disabled={ocupado !== null}
              onClick={() => setDandoDeBaja(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={ocupado !== null || fechaBaja === ""}
              onClick={confirmarBaja}
            >
              {ocupado?.startsWith("baja-") ? "Dando de baja…" : "Dar de baja"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
