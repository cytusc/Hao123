import { useEffect, useState } from "react";

export default function useLocalClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer;
    const refresh = () => {
      clearTimeout(timer);
      const current = new Date();
      setNow(current);
      // Align updates to the next minute, including hour and midnight boundaries.
      timer = setTimeout(refresh, 60000 - (current.getTime() % 60000));
    };
    const resume = () => {
      if (!document.hidden) refresh();
    };
    refresh();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return now;
}
