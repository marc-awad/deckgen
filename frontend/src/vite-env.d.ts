// Variables replaced by Vite at build time (only names starting with VITE_ are exposed)
interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
