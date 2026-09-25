/// <reference types="astro/client" />

// Hasta generar los tipos con `wrangler types` (Tarea 8): el runtime del Worker
// resuelve `cloudflare:workers`; acá solo se declara el binding que usa runtime.ts.
declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>;
}

declare namespace App {
  interface Locals {
    authUserId: string;
  }
}
