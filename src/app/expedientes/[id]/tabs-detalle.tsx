"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Tabs con subrayado estilo WorkOS; el contenido llega renderizado en servidor.
export function TabsDetalle({
  documentos,
  ciclo,
}: {
  documentos: React.ReactNode;
  ciclo: React.ReactNode;
}) {
  return (
    <Tabs defaultValue="documentos" className="gap-5">
      <TabsList className="h-auto w-full justify-start gap-1 rounded-none border-b bg-transparent p-0">
        {[
          { valor: "documentos", etiqueta: "Documentos" },
          { valor: "ciclo", etiqueta: "Ciclo de vida" },
        ].map((t) => (
          <TabsTrigger
            key={t.valor}
            value={t.valor}
            className="relative -mb-px flex-none rounded-none border-0 border-b-2 border-transparent px-4 pb-2.5 pt-1.5 text-sm text-muted-foreground shadow-none transition-colors data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:font-medium data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            {t.etiqueta}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="documentos" className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
        {documentos}
      </TabsContent>
      <TabsContent value="ciclo" className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
        {ciclo}
      </TabsContent>
    </Tabs>
  );
}
