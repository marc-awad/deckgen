import { errorText } from "../api/client";
import type { LoadState } from "../hooks/useLoad";
import { secondaryButton } from "../styles";
import { Spinner } from "./Spinner";

interface LoadStatusProps<T> {
  state: LoadState<T>;
  onRetry: () => void;
}

// Loading indicator or error with a retry button; nothing once the data is loaded
export function LoadStatus<T>({ state, onRetry }: LoadStatusProps<T>) {
  if (state.status === "loading") {
    return (
      <p role="status" className="mt-6 flex items-center gap-3 text-slate-700">
        <Spinner />
        Chargement…
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">
        <p className="font-medium">Le chargement a échoué. {errorText(state.error)}</p>
        <button type="button" onClick={onRetry} className={`${secondaryButton} mt-3`}>
          Réessayer
        </button>
      </div>
    );
  }

  return null;
}
