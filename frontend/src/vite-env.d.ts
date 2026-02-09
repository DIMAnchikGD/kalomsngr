/// <reference types="vite/client" />

interface Window {
  electronAPI?: {
    startHost: (port: number) => Promise<{ ok: boolean; port: number }>;
    stopHost: () => Promise<{ ok: boolean }>;
    getIPv4Addresses: () => Promise<Array<{ interface: string; address: string }>>;
    copyText: (text: string) => Promise<void>;
  };
}
