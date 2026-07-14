import { NextResponse } from "next/server";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { z } from "zod";

import {
  parseId,
  requerirExpedienteEditable,
  requerirUsuario,
  respuesta404,
  respuestaError,
} from "@/lib/api";
import { fichaAnexo } from "@/lib/anexos";
import { query } from "@/lib/db";
import { CONTENT_TYPES_PERMITIDOS, prepararSubidaCliente } from "@/lib/storage/presign";

const MAX_BYTES = 25 * 1024 * 1024;

// La marca de agua envuelve imágenes en PDF con pdf-lib, que no soporta webp;
// los anexos aceptan solo estos tipos.
type TipoAnexo = "application/pdf" | "image/jpeg" | "image/png";

const bodySchema = z.object({
  clave: z.string().trim().min(1),
  nombreArchivo: z.string().trim().min(1).max(255),
  tamanoBytes: z.number().int().min(1).max(MAX_BYTES),
  contentType: z.string().trim(),
});

const eventoSubidaSchema = z.object({
  type: z.literal("blob.generate-presigned-url"),
  payload: z.object({
    pathname: z.string().min(1),
    clientPayload: z.string().nullable(),
    multipart: z.boolean(),
  }),
});

function tipoCanonico(nombreArchivo: string): TipoAnexo | null {
  const extension = nombreArchivo.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  return null;
}

async function prepararAnexo(
  expedienteId: number,
  datos: z.infer<typeof bodySchema>,
) {
  const ficha = fichaAnexo(datos.clave);
  if (!ficha) throw new Error("Anexo no catalogado");
  const contentType = tipoCanonico(datos.nombreArchivo);
  if (!contentType) throw new Error("Solo PDF, JPG o PNG");

  const exp = await query<{
    numero_expediente: string;
    origen: "PROPIA" | "CONSIGNADA";
    siguiente_version: number;
  }>(
    `SELECT e.anio::text || '-' || lpad(e.consecutivo::text, 3, '0') AS numero_expediente,
            e.origen,
            COALESCE((SELECT max(a.version) FROM traza.anexo_expediente a
                       WHERE a.expediente_id = e.id AND a.clave = $2), 0) + 1 AS siguiente_version
       FROM traza.expediente e
      WHERE e.id = $1`,
    [expedienteId, datos.clave],
  );
  if (exp.rowCount === 0) throw new Error("Expediente no encontrado");
  const e = exp.rows[0];
  if (ficha.exigencia[e.origen] === null) {
    throw new Error(`El anexo «${ficha.nombre}» no aplica a una unidad ${e.origen.toLowerCase()}`);
  }

  const extension = CONTENT_TYPES_PERMITIDOS[contentType];
  return {
    contentType,
    rutaObjeto: `anexos/${e.numero_expediente}/${datos.clave}/v${e.siguiente_version}.${extension}`,
  };
}

// PUT prefirmado al store privado con ruta anexos/{expediente}/{clave}/v{n}.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { usuario, error: authError } = await requerirUsuario();
  if (authError) return authError;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Expediente no encontrado");
  const cierreError = await requerirExpedienteEditable(id, usuario);
  if (cierreError) return cierreError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const evento = eventoSubidaSchema.safeParse(body);

  try {
    if (evento.success) {
      if (evento.data.payload.multipart) {
        return NextResponse.json({ error: "Los anexos no usan carga multipart" }, { status: 400 });
      }
      const datos = bodySchema.parse(JSON.parse(evento.data.payload.clientPayload ?? "null"));
      const preparado = await prepararAnexo(id, datos);
      if (preparado.rutaObjeto !== evento.data.payload.pathname) {
        return NextResponse.json({ error: "La ruta de carga no corresponde al anexo solicitado" }, { status: 409 });
      }

      const respuesta = await handleUploadPresigned({
        body: evento.data as HandleUploadPresignedBody,
        request,
        getSignedToken: async () => ({
          ...(await prepararSubidaCliente(preparado.rutaObjeto, preparado.contentType, datos.tamanoBytes)),
        }),
      });
      return NextResponse.json(respuesta);
    }

    const datos = bodySchema.parse(body);
    const preparado = await prepararAnexo(id, datos);

    return NextResponse.json({
      rutaObjeto: preparado.rutaObjeto,
      contentType: preparado.contentType,
    });
  } catch (error) {
    return respuestaError(error);
  }
}
