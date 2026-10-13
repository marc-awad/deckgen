// Tailwind classes shared by several components, to keep buttons and fields consistent

const button =
  "inline-flex items-center justify-center rounded-md px-4 py-2 font-medium " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export const primaryButton = `${button} bg-blue-600 text-white hover:bg-blue-700`;

export const secondaryButton = `${button} border border-slate-300 bg-white text-slate-800 hover:bg-slate-100`;

export const dangerButton = `${button} border border-red-300 bg-white text-red-800 hover:bg-red-50`;

export const fieldClass =
  "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 shadow-sm " +
  "disabled:bg-slate-100 disabled:text-slate-500";
