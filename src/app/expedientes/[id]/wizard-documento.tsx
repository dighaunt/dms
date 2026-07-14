"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  CalendarDaysIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleDashedIcon,
  ClockIcon,
  DatabaseIcon,
  FileDownIcon,
  LoaderCircleIcon,
  PlusIcon,
  SaveIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { GuiaOperativaResumen, GuiaOperativaSheet } from "@/components/guia-operativa-formato";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { etiquetaAlternativa } from "@/lib/formularios/etiquetas";
import type { CampoCaptura, CapturaDocumento } from "@/lib/formularios/tipos";
import { cn } from "@/lib/utils";

type ChoiceGroup = CapturaDocumento["choiceGroups"][number];

function etiquetaOpcion(value: string): string {
  const labels: Record<string, string> = {
    SI: "Sí",
    NO: "No",
    CON: "Con garantía",
    SIN: "Sin garantía",
    OP1: "Opción 1 - paga el consignante",
    OP2: "Opción 2 - paga el consignatario",
    CONSIGNANTE: "Consignante",
    CONSIGNATARIO: "Consignatario",
    ORIGINAL: "Original",
    COPIA: "Copia",
    DIGITAL: "Digital",
    "NO APLICA": "No aplica",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function aplicarReglasCliente(
  rules: CapturaDocumento["rules"],
  input: Record<string, string>,
): Record<string, string> {
  const values = { ...input };
  const activeFills = new Map<string, string>();
  for (const rule of rules) {
    if (values[rule.when.field] !== rule.when.equals) continue;
    for (const [name, value] of Object.entries(rule.fill ?? {})) activeFills.set(name, value);
  }
  for (const rule of rules) {
    for (const [name, automaticValue] of Object.entries(rule.fill ?? {})) {
      if (!activeFills.has(name) && values[name] === automaticValue) values[name] = "";
    }
  }
  for (const [name, value] of activeFills) values[name] = value;
  return values;
}

function payloadEditable(data: CapturaDocumento, values: Record<string, string>) {
  return Object.fromEntries(
    data.fields
      .filter((field) => field.visible && !field.readOnly)
      .map((field) => [field.name, values[field.name] ?? ""]),
  );
}

function valorInicial(data: CapturaDocumento) {
  return aplicarReglasCliente(
    data.rules,
    Object.fromEntries(data.fields.map((field) => [field.name, field.value])),
  );
}

function opcionalesActivos(data: CapturaDocumento, values: Record<string, string>): Set<string> {
  return new Set(
    data.fields
      .filter(
        (field) =>
          field.automaticValue &&
          (values[field.name] ?? "").trim() !== "" &&
          values[field.name] !== field.automaticValue,
      )
      .map((field) => field.name),
  );
}

export function WizardDocumento({
  documentoId,
  onClose,
  onComplete,
}: {
  documentoId: number | null;
  onClose: () => void;
  onComplete?: () => void;
}) {
  const [data, setData] = useState<CapturaDocumento | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [sectionIndex, setSectionIndex] = useState(0);
  const [saving, setSaving] = useState<"save" | "complete" | null>(null);
  const [confirmandoGuia, setConfirmandoGuia] = useState(false);
  const [issues, setIssues] = useState<Map<string, string>>(new Map());
  const [optionalActive, setOptionalActive] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (documentoId == null) return;
    const controller = new AbortController();
    fetch(`/api/documentos/${documentoId}/captura`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? `Error ${response.status}`);
        return body as CapturaDocumento;
      })
      .then((captura) => {
        const initial = valorInicial(captura);
        setData(captura);
        setValues(initial);
        setOptionalActive(opcionalesActivos(captura, initial));
        setSectionIndex(0);
        setIssues(new Map());
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        toast.error("No se pudo abrir el wizard", { description: String(error.message ?? error) });
        onClose();
      });
    return () => controller.abort();
  }, [documentoId, onClose]);

  const requiredNames = useMemo(() => {
    const names = new Set(data?.fields.filter((field) => field.baseRequired).map((field) => field.name));
    for (const rule of data?.rules ?? []) {
      if (values[rule.when.field] !== rule.when.equals) continue;
      for (const name of rule.require ?? []) names.add(name);
    }
    return names;
  }, [data, values]);

  const activeFillNames = useMemo(() => {
    const names = new Set<string>();
    for (const rule of data?.rules ?? []) {
      if (values[rule.when.field] !== rule.when.equals) continue;
      for (const name of Object.keys(rule.fill ?? {})) names.add(name);
    }
    return names;
  }, [data, values]);

  const groupFieldNames = useMemo(
    () => new Set(data?.choiceGroups.flatMap((group) => group.fields) ?? []),
    [data],
  );

  const visibleSections = useMemo(() => {
    if (!data) return [];
    return data.sections.filter((section) =>
      data.fields.some((field) => field.visible && field.section === section.id),
    );
  }, [data]);
  const activeSection = visibleSections[sectionIndex];
  const requiereConfirmacionGuia = Boolean(
    data && data.estado === "BORRADOR" && !data.bloqueada && !data.guiaConfirmada,
  );
  const activeFields = (data?.fields ?? []).filter(
    (field) =>
      field.visible &&
      field.section === activeSection?.id &&
      !groupFieldNames.has(field.name) &&
      !activeFillNames.has(field.name),
  );
  const activeGroups = (data?.choiceGroups ?? []).filter((group) => {
    const first = data?.fields.find((field) => field.name === group.fields[0]);
    return first?.section === activeSection?.id;
  });
  const activeItems = [
    ...activeFields.map((field) => ({ kind: "field" as const, order: field.order, field })),
    ...activeGroups.map((group) => ({
      kind: "group" as const,
      order: Math.min(
        ...group.fields.map(
          (name) => data?.fields.find((field) => field.name === name)?.order ?? Number.MAX_SAFE_INTEGER,
        ),
      ),
      group,
    })),
  ].sort((a, b) => a.order - b.order);
  const firstItem = activeItems[0];
  const activePage = !firstItem
    ? 1
    : firstItem.kind === "field"
      ? firstItem.field.page
      : data?.fields.find((field) => field.name === firstItem.group.fields[0])?.page ?? 1;

  const liveProgress = useMemo(() => {
    if (!data) return { complete: 0, warnings: 0, missing: 0 };
    const groupsComplete = data.choiceGroups.filter((group) =>
      group.fields.some((name) => values[name] === "SI"),
    ).length;
    const standalone = data.fields.filter(
      (field) => field.visible && !groupFieldNames.has(field.name) && !activeFillNames.has(field.name),
    );
    const complete = standalone.filter((field) => (values[field.name] ?? "").trim()).length + groupsComplete;
    const warnings = standalone.filter(
      (field) =>
        !(values[field.name] ?? "").trim() &&
        Boolean(field.automaticValue) &&
        !requiredNames.has(field.name),
    ).length + activeFillNames.size;
    const total = standalone.length + data.choiceGroups.length;
    return { complete, warnings, missing: Math.max(0, total - complete - warnings) };
  }, [activeFillNames, data, groupFieldNames, requiredNames, values]);

  function clearIssues(names: string[]) {
    setIssues((current) => {
      if (!names.some((name) => current.has(name))) return current;
      const next = new Map(current);
      for (const name of names) next.delete(name);
      return next;
    });
  }

  function update(name: string, value: string) {
    if (!data) return;
    setValues((current) => aplicarReglasCliente(data.rules, { ...current, [name]: value }));
    clearIssues([name]);
  }

  function updateGroup(group: ChoiceGroup, selectedName: string) {
    if (!data) return;
    setValues((current) => {
      const next = { ...current };
      for (const name of group.fields) next[name] = name === selectedName ? "SI" : "NO";
      return aplicarReglasCliente(data.rules, next);
    });
    clearIssues(group.fields);
  }

  function toggleOptional(field: CampoCaptura, active: boolean) {
    setOptionalActive((current) => {
      const next = new Set(current);
      if (active) next.add(field.name);
      else next.delete(field.name);
      return next;
    });
    if (!active) update(field.name, "");
  }

  async function submit(action: "save" | "complete", advance = false) {
    if (!data) return;
    setSaving(action);
    try {
      const response = await fetch(`/api/documentos/${data.documentoId}/captura`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, values: payloadEditable(data, values) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const issueRows = Array.isArray(body.missing)
          ? (body.missing as Array<{ name: string; section: string; message?: string }>)
          : [];
        if (issueRows.length > 0) {
          setIssues(new Map(issueRows.map((row) => [row.name, row.message ?? "Revise este dato."])));
          const firstSection = visibleSections.findIndex(
            (section) => section.id === issueRows[0].section,
          );
          if (firstSection >= 0) setSectionIndex(firstSection);
        }
        toast.error(body.error ?? `Error ${response.status}`);
        return;
      }
      const captura = body as CapturaDocumento;
      const nextValues = valorInicial(captura);
      setData(captura);
      setValues(nextValues);
      setOptionalActive(opcionalesActivos(captura, nextValues));
      setIssues(new Map());
      if (action === "complete") {
        toast.success("Captura validada: el documento quedó resuelto y protegido contra huecos");
        onComplete?.();
      } else if (advance && sectionIndex < visibleSections.length - 1) {
        setSectionIndex((index) => index + 1);
      } else {
        toast.success("Borrador guardado");
      }
    } finally {
      setSaving(null);
    }
  }

  async function confirmarGuia() {
    if (!data) return;
    setConfirmandoGuia(true);
    try {
      const response = await fetch(`/api/documentos/${data.documentoId}/guia-confirmacion`, {
        method: "POST",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `Error ${response.status}`);
      setData((current) => current ? { ...current, guiaConfirmada: true } : current);
      toast.success("Guía confirmada", {
        description: "Tu confirmación quedó registrada antes de iniciar la captura.",
      });
    } catch (error) {
      toast.error("No se pudo registrar la confirmación", {
        description: String(error instanceof Error ? error.message : error),
      });
    } finally {
      setConfirmandoGuia(false);
    }
  }

  return (
    <Dialog open={documentoId != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton
        className="h-[92vh] max-h-[920px] w-[96vw] max-w-[1500px] gap-0 overflow-hidden p-0 sm:max-w-[1500px]"
      >
        {!data || data.documentoId !== documentoId ? (
          <div className="flex h-full min-h-96 items-center justify-center gap-3 text-sm text-muted-foreground">
            <LoaderCircleIcon className="size-5 animate-spin" />
            Leyendo campos y reglas del PDF…
          </div>
        ) : (
          <div className="grid h-full min-h-0 grid-rows-[auto_1fr_auto]">
            <DialogHeader className="border-b px-6 py-4 pr-14">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <DialogTitle>Completar {data.folio}</DialogTitle>
                  <DialogDescription>
                    {data.tipo} · revisión {data.revision} · los datos se reutilizan durante el ciclo de vida del expediente
                  </DialogDescription>
                </div>
                <GuiaOperativaSheet tipo={data.tipo} />
              </div>
            </DialogHeader>

            <div className="grid min-h-0 md:grid-cols-[270px_1fr]">
              <aside className="min-h-0 overflow-y-auto border-b bg-muted/20 p-4 md:border-r md:border-b-0">
                <div className="grid grid-cols-3 gap-2">
                  <Metric value={liveProgress.complete} label="Completos" className="text-emerald-600" />
                  <Metric value={liveProgress.warnings} label="Automáticos" className="text-amber-600" />
                  <Metric value={liveProgress.missing} label="Pendientes" className="text-red-600" />
                </div>

                <div className="mt-5 space-y-1">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Secciones del PDF
                  </p>
                  {visibleSections.map((section, index) => {
                    const fields = data.fields.filter(
                      (field) => field.visible && field.section === section.id,
                    );
                    const pending = fields.some(
                      (field) => requiredNames.has(field.name) && !(values[field.name] ?? "").trim(),
                    );
                    return (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => setSectionIndex(index)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                          index === sectionIndex && "bg-background font-medium shadow-sm",
                        )}
                      >
                        {!pending ? (
                          <CheckCircle2Icon className="size-4 shrink-0 text-emerald-600" />
                        ) : (
                          <CircleDashedIcon className="size-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{section.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-5 rounded-xl border bg-background p-3 text-xs leading-relaxed text-muted-foreground">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <DatabaseIcon className="size-4 text-primary" />
                    Captura una sola vez
                  </div>
                  <p className="mt-1.5">
                    Los datos de unidad y contraparte se recuperan automáticamente en los documentos posteriores.
                  </p>
                </div>
              </aside>

              <main className="min-h-0 overflow-y-auto bg-muted/10 p-4 sm:p-6">
                {requiereConfirmacionGuia ? (
                  <ConfirmacionGuia
                    key={data.documentoId}
                    tipo={data.tipo}
                    confirmando={confirmandoGuia}
                    onConfirmar={() => void confirmarGuia()}
                  />
                ) : data.bloqueada && data.estado !== "COMPLETA" ? (
                  <CenteredState
                    icon={<AlertTriangleIcon className="mx-auto size-11 text-amber-600" />}
                    title="Captura cerrada por escaneo"
                    description="Este folio ya tiene un archivo firmado o escaneado. El escaneo preservado es la evidencia vigente y sus datos no pueden alterarse."
                    warning
                  />
                ) : (
                  <div className="mx-auto max-w-6xl">
                    <div className="mb-4 flex items-end justify-between gap-4">
                      <div>
                        <p className="text-xs font-medium text-primary">
                          {data.estado === "COMPLETA"
                            ? "PDF completado · puedes corregirlo mientras el expediente siga abierto"
                            : `Paso ${sectionIndex + 1} de ${visibleSections.length}`}
                        </p>
                        <h3 className="mt-1 text-xl font-semibold">{activeSection?.label}</h3>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Página {activePage} del PDF · <span className="text-red-500">*</span> obligatorio
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {activeItems.map((item) =>
                        item.kind === "group" ? (
                          <ChoiceGroupControl
                            key={`group-${item.group.label}`}
                            group={item.group}
                            fields={item.group.fields
                              .map((name) => data.fields.find((field) => field.name === name))
                              .filter((field): field is CampoCaptura => Boolean(field))}
                            values={values}
                            issue={item.group.fields.map((name) => issues.get(name)).find(Boolean)}
                            onChange={(name) => updateGroup(item.group, name)}
                          />
                        ) : (
                          <FieldControl
                            key={item.field.name}
                            field={{ ...item.field, required: requiredNames.has(item.field.name) }}
                            value={values[item.field.name] ?? ""}
                            issue={issues.get(item.field.name)}
                            optionalActive={optionalActive.has(item.field.name)}
                            onToggle={(active) => toggleOptional(item.field, active)}
                            onChange={(value) => update(item.field.name, value)}
                          />
                        ),
                      )}
                    </div>
                  </div>
                )}
              </main>
            </div>

            <footer className="flex flex-wrap items-center gap-2 border-t bg-background px-5 py-3">
              <Button variant="ghost" onClick={onClose}>Cerrar</Button>
              <span className="flex-1" />
              {!data.bloqueada && !requiereConfirmacionGuia && (
                <>
                  {data.estado === "COMPLETA" && (
                    <Button variant="outline" asChild>
                      <a href={`/api/documentos/${data.documentoId}/formato`} download>
                        <FileDownIcon className="size-4" />
                        Descargar PDF
                      </a>
                    </Button>
                  )}
                  <Button variant="outline" disabled={saving !== null} onClick={() => void submit("save")}>
                    {saving === "save" ? <LoaderCircleIcon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
                    {data.estado === "COMPLETA" ? "Guardar cambios" : "Guardar borrador"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={sectionIndex === 0 || saving !== null}
                    onClick={() => setSectionIndex((index) => index - 1)}
                  >
                    <ChevronLeftIcon className="size-4" />
                    Anterior
                  </Button>
                  {sectionIndex < visibleSections.length - 1 ? (
                    <Button disabled={saving !== null} onClick={() => void submit("save", true)}>
                      Guardar y continuar
                      <ChevronRightIcon className="size-4" />
                    </Button>
                  ) : data.estado !== "COMPLETA" ? (
                    <Button disabled={saving !== null} onClick={() => void submit("complete")}>
                      {saving === "complete" ? <LoaderCircleIcon className="size-4 animate-spin" /> : <CheckCircle2Icon className="size-4" />}
                      Validar y completar
                    </Button>
                  ) : null}
                </>
              )}
            </footer>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ConfirmacionGuia({
  tipo,
  confirmando,
  onConfirmar,
}: {
  tipo: string;
  confirmando: boolean;
  onConfirmar: () => void;
}) {
  const [aceptada, setAceptada] = useState(false);

  return (
    <div className="mx-auto max-w-4xl py-2">
      <div className="rounded-2xl border bg-background p-5 shadow-sm sm:p-6">
        <h3 className="text-lg font-semibold">Confirma la guía antes de capturar</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Esta constancia se registra con tu usuario y fecha para este formato. Si falta un requisito o hay una alerta, detén la captura y escala el caso.
        </p>
        <GuiaOperativaResumen tipo={tipo} />
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm leading-relaxed transition-colors hover:bg-muted/40">
          <input
            type="checkbox"
            checked={aceptada}
            onChange={(event) => setAceptada(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          <span>
            Confirmo que revisé la guía M-01 Rev. 3.0 de este formato y que no iniciaré la captura si falta un requisito o la guía exige escalar.
          </span>
        </label>
        <div className="mt-4 flex justify-end">
          <Button disabled={!aceptada || confirmando} onClick={onConfirmar}>
            {confirmando && <LoaderCircleIcon className="size-4 animate-spin" />}
            Confirmar y comenzar captura
          </Button>
        </div>
      </div>
    </div>
  );
}

function Metric({ value, label, className }: { value: number; label: string; className: string }) {
  return (
    <div className="rounded-lg border bg-background px-2 py-3 text-center">
      <div className={cn("text-lg font-semibold tabular-nums", className)}>{value}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function CenteredState({
  icon,
  title,
  description,
  warning = false,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  warning?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-full max-w-2xl items-center justify-center">
      <div className={cn(
        "w-full rounded-2xl border bg-background p-8 text-center shadow-sm",
        warning && "border-amber-200 bg-amber-50",
      )}>
        {icon}
        <h3 className={cn("mt-4 text-xl font-semibold", warning && "text-amber-950")}>{title}</h3>
        <p className={cn(
          "mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground",
          warning && "text-amber-800",
        )}>
          {description}
        </p>
        {children}
      </div>
    </div>
  );
}

function ChoiceGroupControl({
  group,
  fields,
  values,
  issue,
  onChange,
}: {
  group: ChoiceGroup;
  fields: CampoCaptura[];
  values: Record<string, string>;
  issue?: string;
  onChange: (name: string) => void;
}) {
  const selected = fields.find((field) => values[field.name] === "SI")?.name ?? "";
  return (
    <div className={cn("min-w-0 space-y-2", issue && "text-red-700")}>
      <div className="mb-2 flex items-center gap-2">
        <Label className="font-medium">
          {group.label}
          <RequiredMark />
        </Label>
      </div>
      <Select value={selected} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Seleccione una opción" />
        </SelectTrigger>
        <SelectContent>
          {fields.map((field) => (
            <SelectItem key={field.name} value={field.name}>
              {etiquetaAlternativa(field.label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {issue && <IssueMessage message={issue} />}
    </div>
  );
}

function RequiredMark() {
  return (
    <span aria-hidden className="ml-0.5 select-none text-red-500">
      *
    </span>
  );
}

function FieldControl({
  field,
  value,
  issue,
  optionalActive,
  onToggle,
  onChange,
}: {
  field: CampoCaptura;
  value: string;
  issue?: string;
  optionalActive: boolean;
  onToggle: (active: boolean) => void;
  onChange: (value: string) => void;
}) {
  const id = `wizard-${field.name}`;
  const automatic = Boolean(field.automaticValue) && !field.required && !field.readOnly;
  const showInput = !automatic || optionalActive;
  const sourceLabel = field.source === "system"
    ? "Sistema"
    : field.source === "reused"
      ? "Reutilizado"
      : field.source === "rule"
        ? "Automático"
        : null;
  const wide = field.inputType === "textarea";
  return (
    <div className={cn(
      "min-w-0 space-y-2",
      wide && "md:col-span-2 xl:col-span-3",
      issue && "text-red-700",
    )}>
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={id} className="font-medium">
          {field.label}
          {field.required && <RequiredMark />}
        </Label>
        {sourceLabel && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/8 px-2 py-0.5 text-[10px] font-medium text-primary">
            {field.source === "rule" ? <SparklesIcon className="size-3" /> : <DatabaseIcon className="size-3" />}
            {sourceLabel}
          </span>
        )}
        {!field.required && automatic && (
          <span className="ml-auto text-[10px] font-medium text-muted-foreground">
            Opcional
          </span>
        )}
      </div>

      {showInput ? (
        <>
          <FieldInput id={id} field={field} value={value} onChange={onChange} />
          {automatic && (
            <button
              type="button"
              onClick={() => onToggle(false)}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-3" />
              Resolver automáticamente
            </button>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={() => onToggle(true)}
          className="flex w-full items-center justify-between rounded-lg border border-dashed px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground"
        >
          <span>El sistema resolverá este campo al finalizar.</span>
          <span className="inline-flex items-center gap-1 font-medium text-primary">
            <PlusIcon className="size-3.5" /> Agregar
          </span>
        </button>
      )}
      {issue && <IssueMessage message={issue} />}
      {field.help && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{field.help}</p>}
    </div>
  );
}

function IssueMessage({ message }: { message: string }) {
  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-red-600">
      <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" /> {message}
    </p>
  );
}

function FieldInput({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: CampoCaptura;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.inputType === "boolean") {
    return (
      <div id={id} className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
        {field.options.map((option) => (
          <Button
            key={option}
            type="button"
            variant={value === option ? "default" : "ghost"}
            size="sm"
            disabled={field.readOnly}
            onClick={() => onChange(option)}
          >
            {etiquetaOpcion(option)}
          </Button>
        ))}
      </div>
    );
  }
  if (["radio", "select"].includes(field.inputType)) {
    return (
      <Select value={value} onValueChange={onChange} disabled={field.readOnly}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Seleccione una opción" />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((option) => (
            <SelectItem key={option} value={option}>{etiquetaOpcion(option)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (field.inputType === "date") {
    return <DateField id={id} value={value} readOnly={field.readOnly} onChange={onChange} />;
  }
  if (field.inputType === "time") {
    return <TimeField id={id} value={value} readOnly={field.readOnly} onChange={onChange} />;
  }
  if (field.inputType === "textarea") {
    return (
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        readOnly={field.readOnly}
        maxLength={field.maxLength}
        rows={3}
        className={cn(field.readOnly && "bg-muted/50")}
      />
    );
  }
  const type = field.inputType === "email"
    ? "email"
    : field.inputType === "tel"
      ? "tel"
      : field.inputType === "number"
        ? "number"
        : "text";
  const semanticKey = `${field.label} ${field.name}`;
  const normalize = (raw: string) => {
    if (field.inputType === "tel") return raw.replace(/\D/g, "").slice(0, 10);
    if (/\b(?:RFC|CURP)\b/i.test(semanticKey)) {
      return raw.toLocaleUpperCase("es-MX").slice(0, field.maxLength);
    }
    return raw.slice(0, field.maxLength);
  };
  return (
    <Input
      id={id}
      type={type}
      min={field.inputType === "number" ? 0 : undefined}
      step={field.inputType === "number" ? "any" : undefined}
      inputMode={field.inputType === "number" ? "decimal" : field.inputType === "tel" ? "numeric" : undefined}
      maxLength={field.inputType === "number" ? undefined : field.maxLength}
      pattern={field.inputType === "tel" ? "[0-9]{10}" : undefined}
      value={value}
      onChange={(event) => onChange(normalize(event.target.value))}
      readOnly={field.readOnly}
      className={cn(field.readOnly && "bg-muted/50")}
    />
  );
}

const MONTHS_ES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

function fechaHispana(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value || "Seleccionar fecha";
  return `${match[3]} ${MONTHS_ES[Number(match[2]) - 1]} ${match[1]}`;
}

function fechaActualIso(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function horaActual(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function DateField({
  id,
  value,
  readOnly,
  onChange,
}: {
  id: string;
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={readOnly}
          className="w-full justify-between font-normal"
        >
          {fechaHispana(value)}
          <CalendarDaysIcon className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-date`}>Día, mes y año</Label>
          <Input
            id={`${id}-date`}
            lang="es-MX"
            type="date"
            value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => {
            onChange(fechaActualIso());
            setOpen(false);
          }}
        >
          Usar fecha actual
        </Button>
        <p className="text-center text-xs font-medium text-muted-foreground">
          {fechaHispana(value)}
        </p>
      </PopoverContent>
    </Popover>
  );
}

function TimeField({
  id,
  value,
  readOnly,
  onChange,
}: {
  id: string;
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={readOnly}
          className="w-full justify-between font-normal"
        >
          {value || "Seleccionar hora"}
          <ClockIcon className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-time`}>Hora (24 horas)</Label>
          <Input
            id={`${id}-time`}
            type="time"
            value={/^\d{2}:\d{2}$/.test(value) ? value : ""}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => {
            onChange(horaActual());
            setOpen(false);
          }}
        >
          Usar hora actual
        </Button>
      </PopoverContent>
    </Popover>
  );
}
