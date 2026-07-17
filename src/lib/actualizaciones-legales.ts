// Curaduría manual de la Sección G del M-01 Anexo A. No se genera desde una
// fuente externa en vivo: los montos, fechas y URLs se verifican contra la
// fuente oficial en cada operación (misma regla que el propio anexo).

export type ActualizacionLegal = {
  fecha: string;
  titulo: string;
  resumen: string;
  etiqueta: string;
  href: string;
};

export const ACTUALIZACIONES_LEGALES: ActualizacionLegal[] = [
  {
    fecha: "2026-03-27",
    titulo: "Reforma al Reglamento de la LFPIORPI",
    resumen:
      "Primera reforma desde 2013: exige monitoreo automatizado y auditorías para sujetos obligados. Impacta a las automotrices. Pendiente de evaluar con el contador y el abogado del lote si el PLD manual de Cliquéalo debe migrar a monitoreo con acumulación automática.",
    etiqueta: "Acción pendiente",
    href: "/manuales/m01a-mapeo-jurisprudencia-y-normatividad",
  },
  {
    fecha: "2026-06-20",
    titulo: "Webinar oficial SAT + UIF sobre Actividades Vulnerables",
    resumen:
      "Sesión conjunta del SAT y la UIF sobre obligaciones de la LFPIORPI. El padrón nacional reporta alrededor de 218,000 sujetos obligados.",
    etiqueta: "Capacitación",
    href: "/manuales/m01a-mapeo-jurisprudencia-y-normatividad",
  },
  {
    fecha: "2026-06-04",
    titulo: "Modelo PROFECO/AMDA de compraventa de usado ya inscrito",
    resumen:
      "Nuevo modelo tipo de contrato de adhesión para compraventa de vehículo usado al contado, registrado ante PROFECO. Adoptarlo acelera el registro de C-02 y C-04.",
    etiqueta: "PROFECO",
    href: "/manuales/m01a-eficiencias-legales-y-linea-roja",
  },
  {
    fecha: "2026-07-17",
    titulo: "Candado PLD de efectivo activo en el pago del C-02",
    resumen:
      "El sistema ya bloquea el medio EFECTIVO cuando el precio pactado del C-02 alcanza el umbral PLD (376,565.10 pesos, LFPIORPI art. 32-II) — tanto al registrar el renglón como al certificar el pago.",
    etiqueta: "Cambio en el sistema",
    href: "/manuales/m01a-eficiencias-legales-y-linea-roja",
  },
];
