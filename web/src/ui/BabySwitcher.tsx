import type { ProfileData } from '../logic/types';

interface Props {
  profiles: ProfileData[];
  currentBaby: ProfileData | null;
  onSelect: (id: string) => void;
}

export function BabySwitcher({ profiles, currentBaby, onSelect }: Props) {
  if (profiles.length === 0) return null;
  return (
    <select
      className="baby-switcher"
      value={currentBaby?.id ?? ''}
      onChange={(e) => onSelect(e.target.value)}
      aria-label="切換寶寶"
    >
      {profiles.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
