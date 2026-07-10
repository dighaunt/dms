"use client";

import { createAuthClient } from "@neondatabase/auth/next";

// Cliente de auth para componentes cliente: habla con /api/auth (mismo origen).
export const authClient = createAuthClient();
