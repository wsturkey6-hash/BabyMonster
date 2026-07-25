import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 自繪確認視窗，取代瀏覽器的 confirm()。
 * Safari 的原生 confirm() 一定會顯示網域（githubusername.github.io），無法改成 App 名稱。
 * 用 <dialog>.showModal() 取得原生的焦點鎖定、背景 inert 與 Esc 關閉。
 */
export function ConfirmDialog({ message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      onCancel={(e) => {
        e.preventDefault(); // 讓 Esc 走同一條取消路徑，由 React state 收掉視窗
        onCancel();
      }}
    >
      <p className="title" id="confirm-title">BabyMonster</p>
      <p className="message" id="confirm-message">{message}</p>
      {/* 取消排在前面：showModal() 會把焦點放在第一個可聚焦元素，破壞性動作不該預設被聚焦 */}
      <div className="actions">
        <button className="btn" type="button" onClick={onCancel}>取消</button>
        <button className="btn btn-danger" type="button" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </dialog>
  );
}
