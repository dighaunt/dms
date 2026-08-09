"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserMinusIcon, UserPlusIcon, UsersIcon } from "lucide-react";

import { IconoSilk } from "@/components/iconos/silk";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PinInput } from "@/components/ui/pin-input";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { patchJson, postJson } from "@/lib/cliente-api";
import type { Empleado, Sucursal } from "@/lib/finanzas/tipos";

export type UsuarioEnlazable = { id: number; nombre: string; email: string };

const PATRON_CLAVE = /^[A-Z0-9]{2,8}$/;

const LONGITUD_PIN = 6;

const SIN_USUARIO = "ninguno";

const TODAS = "todas";

export function AdministrarCatalogos({
  sucursales,
  empleados,
  usuarios,
  tienePin,
  esAdministrador,
  miNombre,
}: {
  sucursales: Sucursal[];
  empleados: Empleado[];
  usuarios: UsuarioEnlazable[];
  tienePin: boolean;
  esAdministrador: boolean;
  miNombre: string;
}) {
  return (
    
    <Tabs defaultValue={esAdministrador ? "sucursales" : "pin"}>
      {}
      <TabsList>
        <TabsTrigger value="sucursales">
          <IconoSilk nombre="sucursal" className="shrink-0" />
          Sucursales
        </TabsTrigger>
        <TabsTrigger value="empleados">
          <UsersIcon className="size-4 shrink-0" />
          Personal
        </TabsTrigger>
        <TabsTrigger value="pin">
          <IconoSilk nombre="llave" className="shrink-0" />
          Mi PIN de firma
        </TabsTrigger>
      </TabsList>

      <TabsContent value="sucursales">
        <PanelSucursales sucursales={sucursales} esAdministrador={esAdministrador} />
      </TabsContent>

      <TabsContent value="empleados">
        <PanelEmpleados
          sucursales={sucursales}
          empleados={empleados}
          usuarios={usuarios}
          esAdministrador={esAdministrador}
        />
      </TabsContent>

      <TabsContent value="pin">
        <PanelPin tienePin={tienePin} miNombre={miNombre} />
      </TabsContent>
    </Tabs>
  );
}

function PanelSucursales({
  sucursales,
  esAdministrador,
}: {
  sucursales: Sucursal[];
  esAdministrador: boolean;
}) {
  const router = useRouter();
  const [clave, setClave] = useState("");
  const [nombre, setNombre] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);

  const claveValida = PATRON_CLAVE.test(clave);
  const claveRepetida = sucursales.some((s) => s.clave === clave);
  const nombreValido = nombre.trim().length >= 3;

  async function darDeAlta() {
    setOcupado("alta");
    try {
      const creada = await postJson<Sucursal>("/api/finanzas/catalogos/sucursales", {
        clave,
        nombre: nombre.trim(),
      });
      if (!creada) return;
      toast.success(`Sucursal ${creada.clave} dada de alta`);
      setClave("");
      setNombre("");
      router.refresh();
    } finally {
      setOcupado(null);
    }
  }

  async function cambiarEstado(sucursal: Sucursal) {
    setOcupado(String(sucursal.id));
    try {
      const actualizada = await patchJson<Sucursal>("/api/finanzas/catalogos/sucursales", {
        id: sucursal.id,
        activa: !sucursal.activa,
      });
      if (!actualizada) return;
      toast.success(
        actualizada.activa
          ? `${actualizada.clave} vuelve a admitir folios`
          : `${actualizada.clave} ya no admite folios nuevos`,
      );
      router.refresh();
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconoSilk nombre="sucursal" className="shrink-0" />
            Sucursales
          </CardTitle>
          <CardDescription>
            El consecutivo de cada formato corre por sucursal y por tipo, así que sin al menos una
            no puede emitirse ningún documento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sucursales.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay ninguna sucursal dada de alta.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Clave</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Estado</TableHead>
                  {esAdministrador && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sucursales.map((s) => (
                  <TableRow key={s.id} className={s.activa ? undefined : "opacity-60"}>
                    <TableCell className="font-mono font-medium">{s.clave}</TableCell>
                    <TableCell>{s.nombre}</TableCell>
                    <TableCell>
                      <Badge variant={s.activa ? "secondary" : "outline"}>
                        {s.activa ? "Opera" : "Dada de baja"}
                      </Badge>
                    </TableCell>
                    {esAdministrador && (
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={ocupado !== null}
                          onClick={() => cambiarEstado(s)}
                        >
                          {s.activa ? "Dar de baja" : "Reactivar"}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {esAdministrador ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconoSilk nombre="agregar" className="shrink-0" />
              Dar de alta una sucursal
            </CardTitle>
            <CardDescription>
              La clave se escribe dentro del folio (CACM-RCI-01-MTY-0001) y queda impresa en todo
              lo que se emita, así que no se puede cambiar después: hacerlo reescribiría la cita de
              documentos que ya circulan en papel. Elígela pensando en cómo se leerá dentro de dos
              años.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <div className="space-y-1.5">
                <Label htmlFor="clave">Clave *</Label>
                <Input
                  id="clave"
                  value={clave}

                  onChange={(e) => setClave(e.target.value.toUpperCase().slice(0, 8))}
                  className="font-mono uppercase"
                  placeholder="MTY"
                  aria-invalid={clave !== "" && (!claveValida || claveRepetida)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nombre-sucursal">Nombre *</Label>
                <Input
                  id="nombre-sucursal"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Monterrey Centro"
                />
              </div>
            </div>

            {clave !== "" && !claveValida && (
              <p className="text-xs text-destructive">
                La clave son de 2 a 8 letras mayúsculas o dígitos, sin espacios ni guiones.
              </p>
            )}
            {claveRepetida && (
              <p className="text-xs text-destructive">
                Ya existe una sucursal con esa clave. Dos series de folios no pueden llamarse igual.
              </p>
            )}

            <Button
              disabled={ocupado !== null || !claveValida || claveRepetida || !nombreValido}
              onClick={darDeAlta}
            >
              <IconoSilk nombre="agregar" className="shrink-0" />
              {ocupado === "alta" ? "Dando de alta…" : "Dar de alta"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Alert>
          <IconoSilk nombre="candado" />
          <AlertTitle>Alta reservada a la administración del sistema</AlertTitle>
          <AlertDescription>
            Abrir o cerrar una sucursal abre y cierra una serie de folios. Solicítalo a un
            administrador global (N3).
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function PanelEmpleados({
  sucursales,
  empleados,
  usuarios,
  esAdministrador,
}: {
  sucursales: Sucursal[];
  empleados: Empleado[];
  usuarios: UsuarioEnlazable[];
  esAdministrador: boolean;
}) {
  const router = useRouter();
  const activas = useMemo(() => sucursales.filter((s) => s.activa), [sucursales]);

  const [filtro, setFiltro] = useState<string>(TODAS);
  const [verInactivos, setVerInactivos] = useState(false);
  const [numEmpleado, setNumEmpleado] = useState("");
  const [nombres, setNombres] = useState("");
  const [apellidoPaterno, setApellidoPaterno] = useState("");
  const [apellidoMaterno, setApellidoMaterno] = useState("");
  const [departamento, setDepartamento] = useState("");
  const [puesto, setPuesto] = useState("");
  const [sucursalId, setSucursalId] = useState<string>(String(activas[0]?.id ?? ""));
  const [usuarioId, setUsuarioId] = useState<string>(SIN_USUARIO);
  const [guardando, setGuardando] = useState(false);
  
  const [porDarDeBaja, setPorDarDeBaja] = useState<Empleado | null>(null);

  const nombreArmado = [nombres.trim(), apellidoPaterno.trim(), apellidoMaterno.trim()]
    .filter((parte) => parte !== "")
    .join(" ");

  const porSucursal = useMemo(
    () => new Map(sucursales.map((s) => [s.id, s])),
    [sucursales],
  );

  const visibles = useMemo(() => {
    const porSucursalElegida =
      filtro === TODAS ? empleados : empleados.filter((e) => String(e.sucursalId) === filtro);
    const conBajas = verInactivos ? porSucursalElegida : porSucursalElegida.filter((e) => e.activo);
    return [...conBajas].sort((a, b) =>
      `${a.apellidoPaterno} ${a.apellidoMaterno ?? ""} ${a.nombres}`.localeCompare(
        `${b.apellidoPaterno} ${b.apellidoMaterno ?? ""} ${b.nombres}`,
        "es",
      ),
    );
  }, [empleados, filtro, verInactivos]);

  const dadosDeBaja = useMemo(() => empleados.filter((e) => !e.activo).length, [empleados]);

  const enlazables = useMemo(() => {
    const tomados = new Set(empleados.map((e) => e.usuarioId).filter((id) => id !== null));
    return usuarios.filter((u) => !tomados.has(u.id));
  }, [empleados, usuarios]);

  const numeroRepetido = empleados.some(
    (e) =>
      String(e.sucursalId) === sucursalId &&
      e.numEmpleado.trim().toUpperCase() === numEmpleado.trim().toUpperCase(),
  );

  const listoParaGuardar =
    numEmpleado.trim() !== "" &&
    nombres.trim().length >= 2 &&
    apellidoPaterno.trim().length >= 2 &&
    sucursalId !== "" &&
    !numeroRepetido;

  async function darDeAlta() {
    setGuardando(true);
    try {
      const creado = await postJson<Empleado>("/api/finanzas/catalogos/empleados", {
        numEmpleado: numEmpleado.trim(),
        nombres: nombres.trim(),
        apellidoPaterno: apellidoPaterno.trim(),
        apellidoMaterno: apellidoMaterno.trim() || null,
        departamento: departamento.trim() || null,
        puesto: puesto.trim() || null,
        sucursalId: Number(sucursalId),
        usuarioId: usuarioId === SIN_USUARIO ? null : Number(usuarioId),
      });
      if (!creado) return;
      toast.success(`${creado.nombre} dado de alta`);
      setNumEmpleado("");
      setNombres("");
      setApellidoPaterno("");
      setApellidoMaterno("");
      setPuesto("");
      setUsuarioId(SIN_USUARIO);
      router.refresh();
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarAlta(empleado: Empleado, activo: boolean) {
    setGuardando(true);
    try {
      const actualizado = await patchJson<Empleado>("/api/finanzas/catalogos/empleados", {
        id: empleado.id,
        activo,
      });
      if (!actualizado) return;
      toast.success(
        activo
          ? `${actualizado.nombre} vuelve a estar activo`
          : `${actualizado.nombre} queda inhabilitado; su ficha y sus folios siguen ahí`,
      );
      setPorDarDeBaja(null);
      router.refresh();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersIcon className="size-4 shrink-0" />
            Personal
          </CardTitle>
          <CardDescription>
            Quien aparece como vendedor en un RCI-01 o como trabajador en un recibo de nómina sale
            de aquí.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="max-w-xs flex-1 space-y-1.5">
              <Label htmlFor="filtro-sucursal">Ver sucursal</Label>
              <Select value={filtro} onValueChange={setFiltro}>
                <SelectTrigger id="filtro-sucursal" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS}>Todas las sucursales</SelectItem>
                  {sucursales.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.clave} · {s.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {}
            {dadosDeBaja > 0 && (
              <Button
                variant={verInactivos ? "secondary" : "outline"}
                size="sm"
                onClick={() => setVerInactivos((v) => !v)}
              >
                {verInactivos ? "Ocultar" : "Ver"} {dadosDeBaja} dado(s) de baja
              </Button>
            )}
          </div>

          {visibles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay personal dado de alta en esa sucursal.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>No.</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Departamento</TableHead>
                  <TableHead>Puesto</TableHead>
                  <TableHead>Sucursal</TableHead>
                  <TableHead>Usuario del sistema</TableHead>
                  <TableHead>Estado</TableHead>
                  {esAdministrador && <TableHead className="text-right">Alta / baja</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((e) => {
                  const sucursal = porSucursal.get(e.sucursalId);
                  const usuario = usuarios.find((u) => u.id === e.usuarioId);
                  return (
                    <TableRow key={e.id} className={e.activo ? undefined : "opacity-60"}>
                      <TableCell className="font-mono">{e.numEmpleado}</TableCell>
                      <TableCell className="font-medium">
                        {e.apellidoPaterno} {e.apellidoMaterno ?? ""}, {e.nombres}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {e.departamento ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{e.puesto ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {sucursal ? sucursal.clave : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {e.usuarioId === null ? "Sin cuenta" : (usuario?.email ?? "Enlazado")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={e.activo ? "secondary" : "outline"}>
                          {e.activo ? "Activo" : "Baja"}
                        </Badge>
                        {!e.activo && e.bajaEn && (
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            desde {new Date(e.bajaEn).toLocaleDateString("es-MX")}
                          </span>
                        )}
                      </TableCell>
                      {esAdministrador && (
                        <TableCell className="text-right">
                          {e.activo ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={guardando}
                              onClick={() => setPorDarDeBaja(e)}
                            >
                              Dar de baja
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={guardando}
                              onClick={() => cambiarAlta(e, true)}
                            >
                              Reactivar
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!esAdministrador ? (
        <Alert>
          <IconoSilk nombre="candado" />
          <AlertTitle>Alta reservada a la administración del sistema</AlertTitle>
          <AlertDescription>
            El personal se da de alta desde la administración global (N3), porque de esta lista
            dependen los nombres impresos en los recibos.
          </AlertDescription>
        </Alert>
      ) : activas.length === 0 ? (
        <Alert>
          <IconoSilk nombre="aviso" />
          <AlertTitle>Primero hace falta una sucursal</AlertTitle>
          <AlertDescription>
            Cada ficha de personal pertenece a una sucursal. Da de alta al menos una en la pestaña
            anterior.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlusIcon className="size-4 shrink-0" />
              Dar de alta personal
            </CardTitle>
            <CardDescription>
              El usuario del sistema es opcional y casi siempre sobra: el trabajador que cobra un
              recibo de nómina no tiene por qué operar la aplicación. Sólo se enlaza cuando la
              misma persona además entra al sistema, para que quien firma con su PIN y quien
              aparece impreso sean reconociblemente el mismo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="num-empleado">Número de empleado *</Label>
                <Input
                  id="num-empleado"
                  value={numEmpleado}
                  onChange={(e) => setNumEmpleado(e.target.value.slice(0, 20))}
                  className="font-mono"
                  placeholder="0142"
                  aria-invalid={numeroRepetido}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="nombres-empleado">Nombre(s) *</Label>
                <Input
                  id="nombres-empleado"
                  value={nombres}
                  onChange={(e) => setNombres(e.target.value.slice(0, 80))}
                  placeholder="DIEGO FERNANDO"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ap-paterno">Apellido paterno *</Label>
                <Input
                  id="ap-paterno"
                  value={apellidoPaterno}
                  onChange={(e) => setApellidoPaterno(e.target.value.slice(0, 80))}
                  placeholder="GARCIA"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ap-materno">Apellido materno</Label>
                <Input
                  id="ap-materno"
                  value={apellidoMaterno}
                  onChange={(e) => setApellidoMaterno(e.target.value.slice(0, 80))}
                  placeholder="RAMOS"
                />
                {}
                <p className="text-xs text-muted-foreground">
                  Déjalo vacío si esa persona lleva un solo apellido.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="departamento">Departamento</Label>
                <Input
                  id="departamento"
                  value={departamento}
                  onChange={(e) => setDepartamento(e.target.value.slice(0, 80))}
                  placeholder="VENTAS"
                  list="departamentos-existentes"
                />
                <datalist id="departamentos-existentes">
                  {[...new Set(empleados.map((e) => e.departamento).filter(Boolean))].map((d) => (
                    <option key={d} value={d as string} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="puesto">Puesto</Label>
                <Input
                  id="puesto"
                  value={puesto}
                  onChange={(e) => setPuesto(e.target.value)}
                  placeholder="Vendedor"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sucursal-empleado">Sucursal *</Label>
                <Select value={sucursalId} onValueChange={setSucursalId}>
                  <SelectTrigger id="sucursal-empleado" className="w-full">
                    <SelectValue placeholder="Elige una sucursal" />
                  </SelectTrigger>
                  <SelectContent>
                    {activas.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.clave} · {s.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="usuario-empleado">Usuario del sistema (opcional)</Label>
                <Select value={usuarioId} onValueChange={setUsuarioId}>
                  <SelectTrigger id="usuario-empleado" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_USUARIO}>Sin usuario del sistema</SelectItem>
                    {enlazables.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.nombre} · {u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {numeroRepetido && (
              <p className="text-xs text-destructive">
                Esa sucursal ya tiene un empleado con ese número. El par sucursal + número es
                irrepetible.
              </p>
            )}

            {}
            {nombreArmado !== "" && (
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Saldrá impreso como</p>
                <p className="font-medium">{nombreArmado}</p>
              </div>
            )}

            <Button disabled={guardando || !listoParaGuardar} onClick={darDeAlta}>
              <UserPlusIcon className="size-4 shrink-0" />
              {guardando ? "Dando de alta…" : "Dar de alta"}
            </Button>
          </CardContent>
        </Card>
      )}

      {}
      <Dialog
        open={porDarDeBaja !== null}
        onOpenChange={(abierto) => !abierto && setPorDarDeBaja(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserMinusIcon className="size-4 shrink-0" />
              Dar de baja a {porDarDeBaja?.nombre}
            </DialogTitle>
            <DialogDescription>
              Deja de aparecer en las capturas nuevas. No se borra nada.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 text-sm">
            <p>
              <strong>Dar de baja no borra: inhabilita.</strong> Su ficha se queda donde está, y
              tiene que quedarse: cada recibo que esa persona cobró la cita por su nombre, y leer
              un folio de hace tres años exige poder resolver quién era el vendedor.
            </p>
            <p className="text-muted-foreground">
              Podrás verla aquí con &ldquo;ver dados de baja&rdquo;, y reactivarla en cualquier
              momento si vuelve.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={guardando} onClick={() => setPorDarDeBaja(null)}>
              Mejor no
            </Button>
            <Button
              disabled={guardando}
              onClick={() => porDarDeBaja && cambiarAlta(porDarDeBaja, false)}
            >
              {guardando ? "Dando de baja…" : "Dar de baja"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PanelPin({ tienePin, miNombre }: { tienePin: boolean; miNombre: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [guardando, setGuardando] = useState(false);

  const completo = pin.length === LONGITUD_PIN;
  const confirmacionCompleta = confirmacion.length === LONGITUD_PIN;

  
  const coinciden = completo && pin === confirmacion;

  async function guardar() {
    setGuardando(true);
    try {
      const respuesta = await postJson<{ establecido: boolean }>(
        "/api/finanzas/catalogos/pin",
        { pin },
      );

      setPin("");
      setConfirmacion("");
      if (!respuesta) return;
      toast.success(tienePin ? "Tu PIN de firma quedó cambiado" : "Tu PIN de firma quedó listo");
      router.refresh();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconoSilk nombre="llave" className="shrink-0" />
            Mi PIN de firma
            <Badge variant={tienePin ? "secondary" : "destructive"}>
              {tienePin ? "Establecido" : "Sin establecer"}
            </Badge>
          </CardTitle>
          <CardDescription>
            Es la rúbrica de {miNombre}: con él se firman los formatos y sin él ningún documento
            que te toque puede cerrarse. Sólo tú lo estableces y sólo el tuyo —ni un administrador
            puede ponerte uno—, y se guarda cifrado, así que nadie puede leerlo ni recuperarlo. Si
            se te olvida, se establece otro desde aquí.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!tienePin && (
            <Alert>
              <IconoSilk nombre="aviso" />
              <AlertTitle>Todavía no puedes firmar</AlertTitle>
              <AlertDescription>
                Establece tu PIN antes de capturar: quedarte a medias de una firma con el documento
                ya emitido obliga a cancelarlo.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label>{tienePin ? "Nuevo PIN" : "PIN"} · {LONGITUD_PIN} dígitos</Label>
            <PinInput
              longitud={LONGITUD_PIN}
              valor={pin}
              onChange={setPin}
              disabled={guardando}
              aria-label="Nuevo PIN de firma"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Repítelo</Label>
            <PinInput
              longitud={LONGITUD_PIN}
              valor={confirmacion}
              onChange={setConfirmacion}
              disabled={guardando}
              aria-label="Confirmación del PIN de firma"
            />
            {confirmacionCompleta && !coinciden && (
              <p className="text-xs text-destructive">
                Los dos PIN no son iguales. Bórralos y captúralos de nuevo.
              </p>
            )}
          </div>

          <Button disabled={guardando || !coinciden} onClick={guardar}>
            <IconoSilk nombre="llave" className="shrink-0" />
            {guardando ? "Guardando…" : tienePin ? "Cambiar mi PIN" : "Establecer mi PIN"}
          </Button>

          <p className="text-xs text-muted-foreground">
            Elige algo que no sea tu fecha de nacimiento ni una serie corrida. Firmar con el PIN de
            otra persona, aunque te lo preste, deja el documento a nombre de quien no estuvo ahí.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
