import { useMemo } from "react";

export function useWindowLabel() {
  return useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const windowType = params.get("window") || "main";
    const sessionKey = params.get("session") || null;
    return { windowType, sessionKey };
  }, []);
}
