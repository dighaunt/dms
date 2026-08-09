import type { NextConfig } from "next";

const nextConfig: NextConfig = {

  outputFileTracingIncludes: {
    "/api/documentos/[id]/formato": ["./public/formatos/*.pdf"],
  },
};

export default nextConfig;
