import React from 'react'

const STORAGE_KEY = 'sap_ops_preferences_v1'

const DEFAULT_PREFS = {
  customer: 'CBJ',
  systemId: 'PRD',
  environment: 'Production',
  density: 'analyst',
  evidenceFormat: 'rca',
  theme: 'ops-dark',
  autoSaveEvidence: true,
  includeTimestamps: true,
  thresholds: {
    responseMs: 1000,
    dbPercent: 40,
    rollWaitPercent: 25,
    errorCount: 5,
  },
  handoff: {
    basisPic: '',
    infraPic: '',
    changeWindow: '',
  },
}

const clampNumber = (value, min, max) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

const loadPreferences = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      thresholds: { ...DEFAULT_PREFS.thresholds, ...(parsed.thresholds || {}) },
      handoff: { ...DEFAULT_PREFS.handoff, ...(parsed.handoff || {}) },
    }
  } catch {
    return DEFAULT_PREFS
  }
}

const Field = ({ label, children, hint }) => (
  <label className="settingsField">
    <span>{label}</span>
    {children}
    {hint && <em>{hint}</em>}
  </label>
)

const Toggle = ({ checked, onChange, label }) => (
  <button
    type="button"
    className={`settingsToggle ${checked ? 'isOn' : ''}`}
    aria-pressed={checked}
    onClick={() => onChange(!checked)}
  >
    <span aria-hidden="true" />
    {label}
  </button>
)

export default function ToolSettings(){
  const [prefs, setPrefs] = React.useState(loadPreferences)
  const [importText, setImportText] = React.useState('')
  const [notice, setNotice] = React.useState('Preferences saved locally')

  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
      setNotice('Preferences saved locally')
    } catch {
      setNotice('Unable to save preferences in this browser')
    }
  }, [prefs])

  const update = (patch) => setPrefs((current) => ({ ...current, ...patch }))
  const updateThreshold = (key, value, min, max) => {
    setPrefs((current) => ({
      ...current,
      thresholds: {
        ...current.thresholds,
        [key]: clampNumber(value, min, max),
      },
    }))
  }
  const updateHandoff = (key, value) => {
    setPrefs((current) => ({
      ...current,
      handoff: { ...current.handoff, [key]: value },
    }))
  }

  const exportJson = React.useMemo(() => JSON.stringify(prefs, null, 2), [prefs])

  const importPreferences = () => {
    try {
      const parsed = JSON.parse(importText)
      setPrefs({
        ...DEFAULT_PREFS,
        ...parsed,
        thresholds: { ...DEFAULT_PREFS.thresholds, ...(parsed.thresholds || {}) },
        handoff: { ...DEFAULT_PREFS.handoff, ...(parsed.handoff || {}) },
      })
      setImportText('')
      setNotice('Preferences imported')
    } catch {
      setNotice('Import failed: JSON is not valid')
    }
  }

  return (
    <section className="container section settingsPage">
      <div className="settingsHero">
        <div>
          <div className="eyebrow">SAP Basis Module</div>
          <h1 className="settingsTitle">Ops Preferences</h1>
          <p className="settingsDesc">
            Central threshold, workspace, and handoff defaults for repeatable daily checks, analyzer triage, and RCA exports.
          </p>
        </div>
        <div className="settingsStatus">
          <span>Status</span>
          <strong>{notice}</strong>
        </div>
      </div>

      <div className="settingsGrid">
        <section className="settingsPanel settingsPanelWide">
          <div className="settingsPanelHead">
            <span>System Context</span>
            <b>{prefs.customer} / {prefs.systemId}</b>
          </div>
          <div className="settingsFormGrid">
            <Field label="Customer">
              <input className="settingsInput" value={prefs.customer} onChange={(e) => update({ customer: e.target.value })} />
            </Field>
            <Field label="System ID">
              <input className="settingsInput" value={prefs.systemId} onChange={(e) => update({ systemId: e.target.value.toUpperCase() })} maxLength={8} />
            </Field>
            <Field label="Environment">
              <select className="settingsInput" value={prefs.environment} onChange={(e) => update({ environment: e.target.value })}>
                <option>Production</option>
                <option>Quality</option>
                <option>Development</option>
                <option>Sandbox</option>
              </select>
            </Field>
            <Field label="Evidence Format">
              <select className="settingsInput" value={prefs.evidenceFormat} onChange={(e) => update({ evidenceFormat: e.target.value })}>
                <option value="rca">RCA brief</option>
                <option value="daily-check">Daily check</option>
                <option value="change-evidence">Change evidence</option>
              </select>
            </Field>
          </div>
        </section>

        <section className="settingsPanel">
          <div className="settingsPanelHead">
            <span>Workspace</span>
          </div>
          <div className="settingsSegmented" aria-label="Density">
            {['analyst', 'compact', 'war-room'].map((mode) => (
              <button key={mode} type="button" className={prefs.density === mode ? 'isActive' : ''} onClick={() => update({ density: mode })}>
                {mode}
              </button>
            ))}
          </div>
          <div className="settingsToggleList">
            <Toggle checked={prefs.autoSaveEvidence} onChange={(v) => update({ autoSaveEvidence: v })} label="Auto-save evidence draft" />
            <Toggle checked={prefs.includeTimestamps} onChange={(v) => update({ includeTimestamps: v })} label="Include timestamps in exports" />
          </div>
        </section>

        <section className="settingsPanel settingsPanelWide">
          <div className="settingsPanelHead">
            <span>Triage Thresholds</span>
            <b>Used as SAP ops defaults</b>
          </div>
          <div className="thresholdGrid">
            <Field label="Avg Response" hint={`${prefs.thresholds.responseMs} ms`}>
              <input type="range" min="250" max="5000" step="50" value={prefs.thresholds.responseMs} onChange={(e) => updateThreshold('responseMs', e.target.value, 250, 5000)} />
            </Field>
            <Field label="DB Share" hint={`${prefs.thresholds.dbPercent}%`}>
              <input type="range" min="5" max="90" step="1" value={prefs.thresholds.dbPercent} onChange={(e) => updateThreshold('dbPercent', e.target.value, 5, 90)} />
            </Field>
            <Field label="Roll Wait Share" hint={`${prefs.thresholds.rollWaitPercent}%`}>
              <input type="range" min="1" max="80" step="1" value={prefs.thresholds.rollWaitPercent} onChange={(e) => updateThreshold('rollWaitPercent', e.target.value, 1, 80)} />
            </Field>
            <Field label="Error Count" hint={`${prefs.thresholds.errorCount} events`}>
              <input type="range" min="1" max="100" step="1" value={prefs.thresholds.errorCount} onChange={(e) => updateThreshold('errorCount', e.target.value, 1, 100)} />
            </Field>
          </div>
        </section>

        <section className="settingsPanel">
          <div className="settingsPanelHead">
            <span>Handoff</span>
          </div>
          <div className="settingsStack">
            <Field label="Basis PIC">
              <input className="settingsInput" value={prefs.handoff.basisPic} onChange={(e) => updateHandoff('basisPic', e.target.value)} />
            </Field>
            <Field label="Infra PIC">
              <input className="settingsInput" value={prefs.handoff.infraPic} onChange={(e) => updateHandoff('infraPic', e.target.value)} />
            </Field>
            <Field label="Change Window">
              <input className="settingsInput" value={prefs.handoff.changeWindow} onChange={(e) => updateHandoff('changeWindow', e.target.value)} placeholder="Fri 22:00-23:30 WIB" />
            </Field>
          </div>
        </section>

        <section className="settingsPanel settingsPanelWide">
          <div className="settingsPanelHead">
            <span>Portable Config</span>
            <button className="btn" type="button" onClick={() => navigator.clipboard?.writeText(exportJson)}>Copy JSON</button>
          </div>
          <textarea className="settingsTextarea" readOnly value={exportJson} aria-label="Exported preferences JSON" />
        </section>

        <section className="settingsPanel">
          <div className="settingsPanelHead">
            <span>Import / Reset</span>
          </div>
          <textarea className="settingsTextarea settingsTextareaSmall" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Paste preferences JSON" />
          <div className="settingsActions">
            <button className="btn primary" type="button" onClick={importPreferences}>Import</button>
            <button className="btn danger" type="button" onClick={() => setPrefs(DEFAULT_PREFS)}>Reset</button>
          </div>
        </section>
      </div>
    </section>
  )
}
