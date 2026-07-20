/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string | undefined;
  readonly VITE_DEMO_TENANT_ID: string | undefined;
  readonly VITE_DEMO_USER_ID: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
