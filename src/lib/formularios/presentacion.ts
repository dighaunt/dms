import type { CampoFormulario } from "./catalogo";
import { cerrarConGuiones, separarMiles } from "@/lib/numeros";

export function valorCerradoParaPdf(field: CampoFormulario, value: string): string {
  if (field.inputType === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    const months = [
      "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
      "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
    ];
    return `${day} ${months[Number(month) - 1]} ${year}`;
  }
  if (field.inputType === "number" && value !== "NO APLICA") {
    const number = Number(value);
    return Number.isInteger(number)
      ? separarMiles(number)
      : new Intl.NumberFormat("es-MX", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(number);
  }
  if (!field.closeWithHyphens) return value;
  const width = field.widgets[0]?.rect
    ? field.widgets[0].rect[2] - field.widgets[0].rect[0]
    : 240;
  const capacity = Math.max(12, Math.min(90, Math.floor(width / 4.6)));
  return cerrarConGuiones(value, capacity);
}
