import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext();

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* Toasts — bottom-left for RTL */}
      <div className="fixed bottom-4 left-4 z-50 space-y-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-xl shadow-lg text-sm font-medium backdrop-blur-sm animate-slide-in ${
              toast.type === 'error'
                ? 'bg-red-900/80 text-red-200 border border-red-700/50'
                : toast.type === 'success'
                  ? 'bg-green-900/80 text-green-200 border border-green-700/50'
                  : 'bg-blue-900/80 text-blue-200 border border-blue-700/50'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
