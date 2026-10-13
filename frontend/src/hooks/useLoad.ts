import { useEffect, useState } from "react";
import { type ApiError, asApiError } from "../api/client";

export type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; error: ApiError }
  | { status: "success"; data: T };

// Loads data when the page opens; `load` must be stable (module function or useCallback)
export function useLoad<T>(load: () => Promise<T>) {
  const [state, setState] = useState<LoadState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let ignore = false;
    load().then(
      (data) => {
        if (!ignore) setState({ status: "success", data });
      },
      (err: unknown) => {
        if (!ignore) setState({ status: "error", error: asApiError(err) });
      },
    );
    // A response arriving after the page was left (or reloaded) is ignored
    return () => {
      ignore = true;
    };
  }, [load, attempt]);

  function reload() {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }

  // Updates the loaded data locally after a successful action (edit, delete)
  function update(change: (data: T) => T) {
    setState((current) =>
      current.status === "success" ? { status: "success", data: change(current.data) } : current,
    );
  }

  return { state, reload, update };
}
