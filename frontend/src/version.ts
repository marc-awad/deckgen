// Version of this build, given by the Dockerfile (APP_VERSION); "dev" with npm run dev
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || "dev";
