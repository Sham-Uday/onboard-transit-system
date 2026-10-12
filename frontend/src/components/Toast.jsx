import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export default function Toast({ toast, onClose }) {
  if (!toast) return null;

  const { type = 'info', message = '' } = toast;

  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  const icons = {
    success: <CheckCircle2 size={18} className="ob-toast-icon success" />,
    error: <AlertCircle size={18} className="ob-toast-icon error" />,
    info: <Info size={18} className="ob-toast-icon info" />
  };

  return (
    <div className={`ob-toast-container`}>
      <div className={`ob-toast ob-toast-${type}`} role="alert">
        {icons[type] || icons.info}
        <span className="ob-toast-msg">{message}</span>
        <button
          className="ob-toast-close"
          onClick={onClose}
          aria-label="Close notification"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
