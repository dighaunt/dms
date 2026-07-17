import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Callout } from "fumadocs-ui/components/callout";
import { Step, Steps } from "fumadocs-ui/components/steps";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";

import { manualPorSlug } from "@/lib/manuales";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const manual = manualPorSlug(slug);

  return {
    title: manual ? `${manual.manual} · ${manual.titulo}` : "Documentación",
    description: manual?.descripcion,
  };
}

export default async function ManualPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const manual = manualPorSlug(slug);
  if (!manual) notFound();

  const toc = manual.secciones.map((seccion) => ({
    title: seccion.titulo,
    url: `#${seccion.id}`,
    depth: 2,
  }));

  return (
    <DocsPage toc={toc} footer={{ enabled: false }}>
      <p className="mb-2 font-mono text-xs font-semibold text-primary">
        {manual.manual} · {manual.parte}
      </p>
      <DocsTitle>{manual.titulo}</DocsTitle>
      <DocsDescription>{manual.descripcion}</DocsDescription>

      {manual.aviso && (
        <Callout type={manual.aviso.tipo} title={manual.aviso.titulo}>
          {manual.aviso.texto}
        </Callout>
      )}

      <DocsBody>
        {manual.secciones.map((seccion) => (
          <section key={seccion.id} id={seccion.id}>
            <h2>{seccion.titulo}</h2>
            {seccion.parrafos.map((parrafo) => (
              <p key={parrafo}>{parrafo}</p>
            ))}
            {seccion.puntos && (
              <ul>
                {seccion.puntos.map((punto) => <li key={punto}>{punto}</li>)}
              </ul>
            )}
            {seccion.pasos && (
              <Steps>
                {seccion.pasos.map((paso) => <Step key={paso}>{paso}</Step>)}
              </Steps>
            )}
          </section>
        ))}

        <section id="fuentes">
          <h2>Fuente de consulta</h2>
          <ul>
            {manual.fuentes.map((fuente) => (
              <li key={`${fuente.documento}-${fuente.referencia}`}>
                <strong>{fuente.documento}:</strong> {fuente.referencia}
              </li>
            ))}
          </ul>
        </section>
      </DocsBody>
    </DocsPage>
  );
}
