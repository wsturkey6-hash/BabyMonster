import { useEffect, useRef, type ReactNode } from 'react';

interface InfoDialogProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}

/**
 * 說明用對話框：點空白處（backdrop）或按 Esc 收回。
 * 內容包一層 .panel，靠 e.target === dialog 判斷點到的是不是 backdrop。
 */
export function InfoDialog({ title, subtitle, children, onClose }: InfoDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="info-dialog"
      aria-labelledby="info-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="panel">
        <p className="title" id="info-dialog-title">{title}</p>
        {subtitle && <p className="subtitle">{subtitle}</p>}
        <div className="body">{children}</div>
        <button className="btn" type="button" onClick={onClose}>關閉</button>
      </div>
    </dialog>
  );
}
