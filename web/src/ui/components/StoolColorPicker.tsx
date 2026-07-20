import { STOOL_NUMBERS, isAbnormalStoolColor, stoolColorHex, stoolTextHex } from '../../logic/stoolColorCard';

interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
}

export function StoolColorPicker({ value, onChange }: Props) {
  return (
    <div>
      <div className="stool-grid">
        {STOOL_NUMBERS.map((n) => (
          <button
            key={n}
            type="button"
            className={'stool-cell' + (value === n ? ' selected' : '')}
            style={{ background: stoolColorHex(n), color: stoolTextHex(n) }}
            aria-label={`大便卡 ${n} 號`}
            aria-pressed={value === n}
            onClick={() => onChange(value === n ? null : n)}
          >
            {n}
          </button>
        ))}
      </div>
      {value !== null && isAbnormalStoolColor(value) && (
        <p className="warn" role="alert">
          ⚠️ {value} 號屬異常（白陶土色系），可能是膽道閉鎖等警訊，請儘速就醫確認。
        </p>
      )}
      <p className="hint">色塊為近似色，實體大便卡為最終判讀依據。再點一次可取消選擇。</p>
    </div>
  );
}
