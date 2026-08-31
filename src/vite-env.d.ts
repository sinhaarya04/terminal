/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Public calendar id (not secret) — powers the member "subscribe" links.
  readonly VITE_GCAL_ID?: string;
}
