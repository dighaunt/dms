import type { ReglaFormulario, TipoEntrada } from "./catalogo";
import type { ConfiguracionCalculoPena } from "@/lib/calculos/pena-convencional";

export type CampoCaptura = {
  name: string;
  label: string;
  section: string;
  page: number;
  order: number;
  inputType: TipoEntrada;
  maxLength: number;
  options: string[];
  value: string;
  source: "system" | "capture" | "derived" | "reused" | "rule";
  readOnly: boolean;
  visible: boolean;
  baseRequired: boolean;
  required: boolean;
  automaticValue?: string;
  help?: string;
};

export type CapturaDocumento = {
  documentoId: number;
  tipo: string;
  folio: string;
  revision: string;
  estado: "BORRADOR" | "COMPLETA";
  bloqueada: boolean;
  guiaConfirmada: boolean;
  sections: Array<{ id: string; label: string }>;
  fields: CampoCaptura[];
  rules: ReglaFormulario[];
  choiceGroups: Array<{
    label: string;
    fields: string[];
    min: number;
    max: number;
  }>;
  calculoPena?: {
    configuracion: ConfiguracionCalculoPena;
    resultadoCanonico?: {
      montoBase: string;
      porcentaje: string;
      obligacionPrincipal: string;
      montoPena: string;
      montoDevolucion: string | null;
      calculadoEn: string;
    };
  };
  progress: {
    total: number;
    complete: number;
    missing: number;
    warnings: number;
  };
};
