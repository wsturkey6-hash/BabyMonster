import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  FUNDING_NAMES,
  SCHEDULE_SOURCES,
  VACCINES,
  ageMonthsLabel,
  doseDate,
  nextMilestone,
  scheduleMilestones,
  type Funding,
  type ScheduledDose,
  type Vaccine,
} from '../logic/vaccines';
import { doneMap, doseRecordKey, overdueDoses, type VaccineDoseRecord } from '../logic/vaccineLog';
import { db } from '../db/db';
import { clearVaccineDose, setVaccineDose } from '../db/repository';
import { BabySwitcher } from './BabySwitcher';
import { InfoDialog } from './components/InfoDialog';
import { dateInputValue, msFromDateInput, ymdSlash } from './format';
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

  const babyId = currentBaby?.id ?? null;
  const logged = useLiveQuery(
    () =>
      babyId
        ? db.vaccineDoses.where('babyId').equals(babyId).toArray()
        : Promise.resolve<VaccineDoseRecord[]>([]),
    [babyId],
    [] as VaccineDoseRecord[],
  );
  const done = doneMap(logged);

  /** 某一劑的施打日期；沒有寶寶或沒紀錄回傳 undefined。 */
  const doneDate = (vaccineId: string, doseLabel: string): number | undefined =>
    babyId ? done.get(doseRecordKey(babyId, vaccineId, doseLabel)) : undefined;
  const isDone = (d: ScheduledDose) => doneDate(d.vaccine.id, d.dose.label) !== undefined;

  const milestones = scheduleMilestones();
  const upcoming = currentBaby ? nextMilestone(currentBaby.birthDate, now, VACCINES, isDone) : null;
  const overdue = currentBaby
    ? overdueDoses(currentBaby.birthDate, now, currentBaby.id, done)
    : [];

  const byFunding = (doses: ScheduledDose[], funding: Funding) =>
    doses.filter((d) => d.dose.funding === funding);

  const vaccineButton = (d: ScheduledDose) => {
    const date = doneDate(d.vaccine.id, d.dose.label);
    return (
      <button
        key={`${d.vaccine.id}-${d.dose.label}`}
        type="button"
        className={'vaccine-chip ' + d.dose.funding + (date ? ' done' : '')}
        onClick={() => setSelected(d.vaccine)}
      >
        <span className="vaccine-name">{d.vaccine.name}</span>
        <span className="vaccine-dose">
          {date
            ? `✓ ${d.dose.label}・${ymdSlash(date)}`
            : `${d.dose.label}・${FUNDING_NAMES[d.dose.funding]}`}
        </span>
      </button>
    );
  };

  async function saveDose(vaccineId: string, doseLabel: string, date: number) {
    if (!babyId) return;
    await setVaccineDose(babyId, vaccineId, doseLabel, date);
  }

  async function removeDose(vaccineId: string, doseLabel: string) {
    if (!babyId) return;
    await clearVaccineDose(babyId, vaccineId, doseLabel);
  }

  const overdueList = (funding: Funding) => {
    const items = overdue.filter((d) => d.dose.funding === funding);
    if (items.length === 0 || !currentBaby) return null;
    return (
      <div className={'overdue-group ' + funding}>
        <p className="overdue-label">
          {funding === 'public' ? '公費' : '自費（依醫師建議選擇性接種）'}
        </p>
        <ul className="overdue-items">
          {items.map((d) => {
            const due = doseDate(currentBaby.birthDate, d.dose.ageMonths);
            return (
              <li key={`${d.vaccine.id}-${d.dose.label}`}>
                <button type="button" onClick={() => setSelected(d.vaccine)}>
                  <span className="overdue-name">{d.vaccine.name} {d.dose.label}</span>
                  <span className="overdue-when">
                    預計 {ymdSlash(due)}・逾期 {-daysUntil(due, now)} 天
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <main className="page">
      <header className="page-header">
        <h1>疫苗</h1>
        <BabySwitcher profiles={profiles} currentBaby={currentBaby} onSelect={onSelectBaby} />
      </header>

      <section className="card">
        <h2>接下來要打的疫苗</h2>
        {overdue.length > 0 && (
          <div className="overdue" role="group" aria-label="接種日已過、還沒記錄的疫苗">
            <p className="overdue-title">這幾劑的接種日已經過了，還沒記錄施打日期</p>
            {overdueList('public')}
            {overdueList('self')}
          </div>
        )}
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
            {upcoming.note && <p className="milestone-note">{upcoming.note}</p>}
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
              {m.note && <p className="milestone-note">{m.note}</p>}
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
          <ul className="dose-log">
            {selected.doses.map((dose) => {
              const date = doneDate(selected.id, dose.label);
              const inputId = `dose-${selected.id}-${dose.ageMonths}`;
              const planned = currentBaby ? doseDate(currentBaby.birthDate, dose.ageMonths) : 0;
              return (
                <li key={dose.label} className="dose-log-row">
                  <label htmlFor={inputId}>
                    {ageMonthsLabel(dose.ageMonths)}・{dose.label}・{FUNDING_NAMES[dose.funding]}
                  </label>
                  <div className="dose-log-controls">
                    <input
                      id={inputId}
                      type="date"
                      value={date ? dateInputValue(date) : ''}
                      disabled={!currentBaby}
                      onChange={(e) =>
                        e.target.value
                          ? saveDose(selected.id, dose.label, msFromDateInput(e.target.value))
                          : removeDose(selected.id, dose.label)
                      }
                    />
                    {currentBaby && date === undefined && (
                      <button
                        type="button"
                        className="btn btn-soft"
                        onClick={() => saveDose(selected.id, dose.label, planned)}
                      >
                        預計 {ymdSlash(planned)}
                      </button>
                    )}
                    {date !== undefined && (
                      <button
                        type="button"
                        className="btn btn-soft"
                        onClick={() => removeDose(selected.id, dose.label)}
                      >
                        清除
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {!currentBaby && (
            <p className="hint">尚未建立寶寶，請先到設定頁新增，才能記錄施打日期。</p>
          )}
          {selected.recurring && <p className="doses">{selected.recurring}</p>}
          {selected.note && <p className="doses">附註：{selected.note}</p>}
        </InfoDialog>
      )}
    </main>
  );
}
