import { useState } from 'react';
import {
  FUNDING_NAMES,
  SCHEDULE_SOURCES,
  ageMonthsLabel,
  doseDate,
  nextMilestone,
  scheduleMilestones,
  type Funding,
  type ScheduledDose,
  type Vaccine,
} from '../logic/vaccines';
import { BabySwitcher } from './BabySwitcher';
import { InfoDialog } from './components/InfoDialog';
import { ymdSlash } from './format';
import type { PageProps } from './App';

const FUNDING_ORDER: Funding[] = ['public', 'self'];

function daysUntil(target: number, now: number): number {
  const day = 24 * 60 * 60 * 1000;
  const from = new Date(now);
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  return Math.round((target - base) / day);
}

export default function VaccinePage({ profiles, currentBaby, onSelectBaby }: PageProps) {
  const [selected, setSelected] = useState<Vaccine | null>(null);
  const now = Date.now();

  const milestones = scheduleMilestones();
  const upcoming = currentBaby ? nextMilestone(currentBaby.birthDate, now) : null;

  const byFunding = (doses: ScheduledDose[], funding: Funding) =>
    doses.filter((d) => d.dose.funding === funding);

  const vaccineButton = (d: ScheduledDose) => (
    <button
      key={`${d.vaccine.id}-${d.dose.label}`}
      type="button"
      className={'vaccine-chip ' + d.dose.funding}
      onClick={() => setSelected(d.vaccine)}
    >
      <span className="vaccine-name">{d.vaccine.name}</span>
      <span className="vaccine-dose">{d.dose.label}・{FUNDING_NAMES[d.dose.funding]}</span>
    </button>
  );

  return (
    <main className="page">
      <header className="page-header">
        <h1>疫苗</h1>
        <BabySwitcher profiles={profiles} currentBaby={currentBaby} onSelect={onSelectBaby} />
      </header>

      <section className="card">
        <h2>接下來要打的疫苗</h2>
        {!currentBaby && <p className="hint">尚未建立寶寶，請先到設定頁新增，才能依生日推算接種時間。</p>}
        {currentBaby && !upcoming && <p className="hint">時程表上的疫苗都已經過了接種年齡。</p>}
        {currentBaby && upcoming && (
          <>
            <p className="next-when">
              <span className="next-age">{ageMonthsLabel(upcoming.ageMonths)}</span>
              <span className="next-date">
                {ymdSlash(doseDate(currentBaby.birthDate, upcoming.ageMonths))}
                （還有 {daysUntil(doseDate(currentBaby.birthDate, upcoming.ageMonths), now)} 天）
              </span>
            </p>
            {FUNDING_ORDER.map((funding) => {
              const doses = byFunding(upcoming.doses, funding);
              return (
                <div key={funding} className="funding-group">
                  <span className={'funding-label ' + funding}>{FUNDING_NAMES[funding]}</span>
                  {doses.length === 0 ? (
                    <p className="hint" style={{ margin: 0 }}>這次沒有{FUNDING_NAMES[funding]}疫苗。</p>
                  ) : (
                    <div className="vaccine-chips">{doses.map(vaccineButton)}</div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </section>

      <section className="card">
        <h2>接種時程表</h2>
        <p className="hint" style={{ marginTop: 0 }}>點疫苗名稱可以看它預防什麼。</p>
        <ol className="schedule">
          {milestones.map((m) => (
            <li key={m.ageMonths} className="schedule-step">
              <span className="schedule-age">{ageMonthsLabel(m.ageMonths)}</span>
              <div className="vaccine-chips">{m.doses.map(vaccineButton)}</div>
            </li>
          ))}
        </ol>
      </section>

      <section className="card">
        <h2>資料來源</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          公費時程整理自衛生福利部疾病管制署「現行兒童預防接種時程表（兒童常規疫苗）」{SCHEDULE_SOURCES.public}；
          自費時程整理自 {SCHEDULE_SOURCES.self}。
        </p>
        <p className="hint">
          自費疫苗的劑數與月齡會依廠牌、診所而不同，時程也會不定期調整。
          實際接種時間與項目請以兒童健康手冊及醫師評估為準。
        </p>
      </section>

      {selected && (
        <InfoDialog
          title={selected.name}
          subtitle={selected.en}
          onClose={() => setSelected(null)}
        >
          <p>{selected.description}</p>
          <p className="doses">
            接種時程：
            {selected.doses
              .map((d) => `${ageMonthsLabel(d.ageMonths)} ${d.label}（${FUNDING_NAMES[d.funding]}）`)
              .join('、')}
            {selected.recurring ? `，${selected.recurring}` : ''}
          </p>
          {selected.note && <p className="doses">附註：{selected.note}</p>}
        </InfoDialog>
      )}
    </main>
  );
}
