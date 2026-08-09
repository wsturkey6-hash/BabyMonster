// 統一的圓潤線條 icon（Lucide 風格路徑），搭配黏土風可愛主題。
// 結構性 icon 一律用 SVG（不用 emoji），大小/顏色由 CSS currentColor 控制。

import type { ReactNode } from 'react';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function PencilIcon() {
  return (
    <Icon>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </Icon>
  );
}

export function ChartIcon() {
  return (
    <Icon>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </Icon>
  );
}

export function TrendIcon() {
  return (
    <Icon>
      <path d="M22 7 13.5 15.5l-5-5L2 17" />
      <path d="M16 7h6v6" />
    </Icon>
  );
}

export function SyringeIcon() {
  return (
    <Icon>
      <path d="m18 2 4 4" />
      <path d="m17 7 3-3" />
      <path d="M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5z" />
      <path d="m9 11 4 4" />
      <path d="m5 19-3 3" />
    </Icon>
  );
}

export function SettingsIcon() {
  return (
    <Icon>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

/** 自繪寶寶臉：圓臉 + 呆毛 + 腮紅，放在標題旁增加可愛感。 */
export function BabyFaceIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="13.5" r="8" />
      <path d="M12 5.5q-.3-2.8 2.4-3.3" />
      <circle cx="9" cy="13" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="15" cy="13" r="0.6" fill="currentColor" stroke="none" />
      <path d="M10 16.4q2 1.4 4 0" />
      <circle cx="6.8" cy="15.4" r="0.9" fill="currentColor" stroke="none" opacity="0.35" />
      <circle cx="17.2" cy="15.4" r="0.9" fill="currentColor" stroke="none" opacity="0.35" />
    </svg>
  );
}
