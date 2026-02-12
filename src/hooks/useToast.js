import { useCallback, useMemo, useState } from "react";

const TOAST_DURATION_MS = 3200;
const TOAST_EXIT_MS = 260;

export function useToast() {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const dismiss = useCallback(
    (id) => {
      setToasts((current) =>
        current.map((toast) => (toast.id === id ? { ...toast, isClosing: true } : toast))
      );
      window.setTimeout(() => remove(id), TOAST_EXIT_MS);
    },
    [remove]
  );

  const push = useCallback(
    (message, type = "success") => {
      const id = crypto.randomUUID();
      setToasts((current) => [
        ...current,
        { id, message, type, duration: TOAST_DURATION_MS, isClosing: false },
      ]);
      window.setTimeout(() => dismiss(id), TOAST_DURATION_MS);
    },
    [dismiss]
  );

  const api = useMemo(
    () => ({
      success: (message) => push(message, "success"),
      error: (message) => push(message, "error"),
      info: (message) => push(message, "info"),
      dismiss,
    }),
    [dismiss, push]
  );

  return { toasts, toast: api };
}
