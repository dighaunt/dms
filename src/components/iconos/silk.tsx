

export const ICONOS_SILK = [
  "inicio", "expedientes", "finanzas", "reportes", "catalogos", "manuales", "riesgo", "sucursal",
  "dinero", "monedas", "peso", "cesta", "documento", "copia", "hoja", "hojaOk", "hojaMal", "guion",
  "nota", "tabla", "formulario", "listado", "calendario", "fecha", "reloj", "imprimir", "guardar",
  "paquete", "adjuntar", "enlace", "editar", "campo", "buscar", "lupa", "agregar", "quitar",
  "cancelar", "cerrar", "correcto", "palomita", "advertencia", "alerta", "informacion", "ayuda",
  "aviso", "idea", "enLinea", "fueraDeLinea", "alto", "candado", "llave", "baseDatos", "servidor",
  "disco", "grafica", "pastel", "tendencia", "sello", "estrella", "herramienta", "defecto",
  "etiquetaAzul", "etiquetaVerde", "etiquetaRoja", "etiquetaNaranja", "etiquetaAmarilla",
  "comentario", "correo", "imagen", "mundo", "capas", "monitor", "caja3d", "pestana", "letreroNuevo",
] as const;

export type NombreIconoSilk = (typeof ICONOS_SILK)[number];

export function IconoSilk({
  nombre,
  tamano = 16,
  titulo,
  className,
}: {
  nombre: NombreIconoSilk;
  tamano?: number;
  titulo?: string;
  className?: string;
}) {
  return (
    <svg
      width={tamano}
      height={tamano}
      className={className}
      role={titulo ? "img" : undefined}
      aria-hidden={titulo ? undefined : true}
      aria-label={titulo}
      focusable="false"
    >
      {titulo && <title>{titulo}</title>}
      <use href={`/silk.svg#silk-${nombre}`} />
    </svg>
  );
}

export function CreditoIconos({ className }: { className?: string }) {
  return (
    <p className={className}>
      Iconos{" "}
      <a
        href="http://www.famfamfam.com/lab/icons/silk/"
        target="_blank"
        rel="noreferrer noopener"
        className="underline"
      >
        Silk
      </a>{" "}
      de Mark James, recreados en vector por{" "}
      <a
        href="https://github.com/frhun/silk-icon-scalable"
        target="_blank"
        rel="noreferrer noopener"
        className="underline"
      >
        frhun
      </a>
      . Licencia CC-BY-SA 3.0.
    </p>
  );
}
