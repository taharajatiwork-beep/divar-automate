import {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  CheckCircle,
  AlertCircle,
  Info,
} from 'lucide-react';

const FONT = 'font-[family-name:var(--font-vazir)]';

// ─── Toast ───────────────────────────────────────────────────────────────────

const ToastContext = createContext(null);

let _toastId = 0;

const TOAST_VARIANT = {
  success: {
    border: 'border-l-green-500',
    bg: 'bg-dark-800',
    text: 'text-green-400',
    Icon: CheckCircle,
  },
  error: {
    border: 'border-l-red-500',
    bg: 'bg-dark-800',
    text: 'text-red-400',
    Icon: AlertCircle,
  },
  info: {
    border: 'border-l-blue-500',
    bg: 'bg-dark-800',
    text: 'text-blue-400',
    Icon: Info,
  },
};

function ToastItem({ toast, onDismiss }) {
  const v = TOAST_VARIANT[toast.variant] || TOAST_VARIANT.info;
  const Icon = v.Icon;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border-l-4 shadow-lg min-w-[280px] max-w-sm ${v.border} ${v.bg} ${v.text} ${FONT}`}
    >
      <Icon className="w-5 h-5 shrink-0" />
      <span className="text-sm flex-1 leading-relaxed">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-dark-500 hover:text-white transition-colors shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const add = useCallback(
    (message, variant = 'info') => {
      const id = ++_toastId;
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  const toast = {
    success: (msg) => add(msg, 'success'),
    error: (msg) => add(msg, 'error'),
    info: (msg) => add(msg, 'info'),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {createPortal(
        <div
          className="fixed bottom-4 left-4 z-[9999] flex flex-col gap-2"
          dir="rtl"
        >
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a <ToastProvider>');
  return ctx;
}

// ─── Modal ───────────────────────────────────────────────────────────────────

export function Modal({ open, onClose, children }) {
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      dir="rtl"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose?.();
      }}
    >
      <div
        className={`${FONT} bg-dark-800 border border-dark-700 rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ─── Badge ───────────────────────────────────────────────────────────────────

const BADGE_VARIANTS = {
  success: 'bg-green-900/40 text-green-300',
  warning: 'bg-yellow-900/40 text-yellow-300',
  error: 'bg-red-900/40 text-red-300',
  info: 'bg-blue-900/40 text-blue-300',
  neutral: 'bg-dark-700/60 text-dark-100',
};

export function Badge({ variant = 'neutral', children }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${FONT} ${
        BADGE_VARIANTS[variant] || BADGE_VARIANTS.neutral
      }`}
    >
      {children}
    </span>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

export function Skeleton({ lines = 3, avatar = false }) {
  return (
    <div className={`space-y-3 animate-pulse ${FONT}`} dir="rtl">
      <div className="flex gap-3">
        {avatar && (
          <div className="w-10 h-10 rounded-full bg-dark-700 shrink-0" />
        )}
        <div className="flex-1 space-y-2">
          {Array.from({ length: lines }, (_, i) => (
            <div
              key={i}
              className={`h-4 bg-dark-700 rounded ${
                i === lines - 1 ? 'w-3/4' : 'w-full'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── EmptyState ──────────────────────────────────────────────────────────────

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-16 text-center ${FONT}`}
      dir="rtl"
    >
      {Icon && (
        <div className="mb-4 p-4 rounded-xl bg-dark-800 border border-dark-700">
          <Icon className="w-10 h-10 text-dark-500" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-gray-200 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-dark-500 max-w-sm mb-4">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className={`px-4 py-2 bg-dark-700 hover:bg-dark-600 text-gray-300 rounded-lg text-sm transition-colors ${FONT}`}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// ─── ProgressBar ─────────────────────────────────────────────────────────────

const BAR_COLORS = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
  blue: 'bg-blue-500',
};

export function ProgressBar({ value = 0, color = 'blue' }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="w-full h-2 bg-dark-700 rounded-full overflow-hidden" dir="rtl">
      <div
        className={`h-full rounded-full transition-all duration-500 ease-out ${
          BAR_COLORS[color] || BAR_COLORS.blue
        }`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
