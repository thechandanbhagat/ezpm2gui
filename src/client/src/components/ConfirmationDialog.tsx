import React from 'react';

// @group Types : ConfirmationDialog props
interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'warning' | 'info';
}

// @group Utilities : Derive confirm button classes from dialog type
const confirmButtonClass = (type: 'danger' | 'warning' | 'info'): string => {
  if (type === 'warning') {
    return 'bg-[#1a0e00] border border-[#f59e0b]/30 text-[#f59e0b] font-mono text-xs font-semibold px-4 py-1.5 rounded-sm hover:bg-[#261500] transition-colors';
  }
  if (type === 'info') {
    return 'bg-[#0d1a0d] border border-[#22c55e]/30 text-[#22c55e] font-mono text-xs font-semibold px-4 py-1.5 rounded-sm hover:bg-[#0f220f] transition-colors';
  }
  // danger (default)
  return 'bg-[#7f1d1d] border border-[#ef4444]/30 text-[#ef4444] font-mono text-xs font-semibold px-4 py-1.5 rounded-sm hover:bg-[#991b1b] transition-colors';
};

// @group Utilities : Derive title color from dialog type
const titleClass = (type: 'danger' | 'warning' | 'info'): string => {
  if (type === 'danger')  return 'text-[#ef4444]';
  if (type === 'warning') return 'text-[#f59e0b]';
  return 'text-[#e8e8e8]';
};

// @group ConfirmationDialog : CLI-style modal dialog with danger/warning/info variants
const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  type = 'danger',
}) => {
  if (!isOpen) return null;

  return (
    // @group Render : Overlay backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onCancel}
    >
      {/* @group Render : Dialog card — stop click propagation */}
      <div
        className="w-full max-w-sm mx-4 bg-[#111] border border-[#1e1e1e] rounded-sm overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Title bar */}
        <div className={`px-4 pt-4 pb-2 border-l-2 ${type === 'danger' ? 'border-[#ef4444]' : type === 'warning' ? 'border-[#f59e0b]' : 'border-[#22c55e]'}`}>
          <p className={`text-[11px] font-mono font-bold uppercase tracking-[0.1em] ${titleClass(type)}`}>
            {title}
          </p>
        </div>

        {/* Message */}
        <div className="px-4 py-3">
          <p className="text-[10px] font-mono text-[#888] leading-relaxed">{message}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-4 pb-4">
          <button
            onClick={onCancel}
            className="border border-[#333] text-[#888] font-mono text-xs px-4 py-1.5 rounded-sm hover:border-[#555] hover:text-[#aaa] transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={confirmButtonClass(type)}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationDialog;
