// Decorative: the text next to it says what is happening
export function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-5 shrink-0 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700 motion-reduce:animate-none"
    />
  );
}
