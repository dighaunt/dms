import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    NEON_AUTH_BASE_URL: z.url(),
    NEON_AUTH_COOKIE_SECRET: z.string().min(32),
    // Vercel Blob privado: el SDK usa VERCEL_OIDC_TOKEN + BLOB_STORE_ID
    // directamente de process.env; aquí solo se valida que el store exista.
    BLOB_STORE_ID: z.string().min(1),
    DATA_API_URL: z.url().optional(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NEON_AUTH_BASE_URL: process.env.NEON_AUTH_BASE_URL,
    NEON_AUTH_COOKIE_SECRET: process.env.NEON_AUTH_COOKIE_SECRET,
    BLOB_STORE_ID: process.env.BLOB_STORE_ID,
    DATA_API_URL: process.env.DATA_API_URL,
  },
  emptyStringAsUndefined: true,
});
