/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AMAP_KEY?: string;
  readonly VITE_AMAP_SECURITY_CODE?: string;
  readonly VITE_AMAP_SERVICE_HOST?: string;
  readonly VITE_ROUTER_MODE?: 'hash' | 'history';
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
