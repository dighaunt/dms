import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Los PDFs maestros se leen del filesystem en la ruta de prellenado;
  // sin esto el trazado de Vercel no los empaqueta con la función.
  outputFileTracingIncludes: {
    "/api/documentos/[id]/formato": ["./public/formatos/*.pdf"],
  },
};

export default nextConfig;
