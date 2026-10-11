import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Info, X } from "lucide-react";

export function useFeedback() {
  const [toast, setToast] = useState(null);
  const nextId = useRef(0);
  const notify = useCallback((msg, kind = "success", returnFocus = document.activeElement) => {
    setToast({ id: ++nextId.current, msg: msg || "操作失败，请稍后重试", kind, returnFocus });
  }, []);
  const dismiss = useCallback((id) => {
    setToast((current) => (current?.id === id ? null : current));
  }, []);
  return { toast, notify, dismiss };
}

export default function Feedback({ toast, onDismiss, host }) {
  const [phase, setPhase] = useState("enter");
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [announcement, setAnnouncement] = useState(null);
  const remaining = useRef(0);
  const paused = hovered || focused;

  useEffect(() => {
    if (!toast) {
      setHovered(false);
      setFocused(false);
    }
    remaining.current = toast?.kind === "error"
      ? null
      : toast?.kind === "info" || toast?.msg.length > 24
        ? Math.max(5000, Math.min(12000, (toast?.msg.length || 0) * 180))
        : 2600;
    setPhase("enter");
    const frame = requestAnimationFrame(() => setPhase("show"));
    return () => cancelAnimationFrame(frame);
  }, [toast]);

  useEffect(() => {
    if (!toast || phase !== "show" || paused || remaining.current === null) return;
    const started = performance.now();
    const timer = setTimeout(() => setPhase("exit"), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (performance.now() - started));
    };
  }, [toast, phase, paused]);

  useEffect(() => {
    if (!toast || phase !== "exit") return;
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => onDismiss(toast.id), reduceMotion ? 0 : 150);
    return () => clearTimeout(timer);
  }, [toast, phase, onDismiss]);

  // Update an already mounted live region, including repeated identical messages.
  // Moving between the page and a native dialog also needs an active region.
  useEffect(() => {
    setAnnouncement(null);
    if (!toast) return;
    const timer = setTimeout(() => setAnnouncement(toast), 40);
    return () => clearTimeout(timer);
  }, [toast, host]);

  const Icon = toast?.kind === "error" ? X : toast?.kind === "info" ? Info : Check;
  const content = (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement?.kind !== "error" ? announcement?.msg : ""}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {announcement?.kind === "error" ? announcement.msg : ""}
      </div>
      {toast && (
        <div
          className={`toast${host ? " toast-inline" : ""}`}
          data-kind={toast.kind}
          data-phase={phase}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") setHovered(true);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") setHovered(false);
          }}
          onFocus={() => setFocused(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
          }}
        >
          <Icon className="toast-icon" size={17} aria-hidden="true" />
          <span className="toast-message" tabIndex={toast.msg.length > 120 ? 0 : undefined}>
            {toast.msg}
          </span>
          <button
            className="toast-close"
            aria-label="关闭提示"
            onClick={() => {
              if (toast.returnFocus?.isConnected) toast.returnFocus.focus({ preventScroll: true });
              onDismiss(toast.id);
            }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
  return createPortal(content, host || document.body);
}
