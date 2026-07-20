export function Toast({ message }: { message: string | null }) {
  // aria-live 區域常駐 DOM，訊息變動時螢幕閱讀器才會播報
  return (
    <div role="status" aria-live="polite">
      {message && <div className="toast">{message}</div>}
    </div>
  );
}
