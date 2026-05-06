import React from 'react'

const defaultChecks = [
  'Define source file format and ownership',
  'Connect evidence output to war-room update',
  'Add export path for audit handoff',
]

export default function ToolWorkbench({
  title,
  eyebrow = 'SAP Basis Module',
  desc,
  status = 'Ready for workflow design',
  primaryHref = '#/tool/comparer',
  primaryLabel = 'Open Comparer',
  secondaryHref = '#/',
  secondaryLabel = 'Back to Home',
  signals = [],
  checks = defaultChecks,
}){
  const visibleSignals = signals.length ? signals : [
    { label: 'Input', value: 'Pending' },
    { label: 'Evidence', value: 'Draft' },
    { label: 'Next action', value: 'Map flow' },
  ]

  return (
    <section className="container section">
      <div className="workbenchShell">
        <div className="workbenchHero">
          <div>
            <div className="eyebrow">{eyebrow}</div>
            <h1 className="workbenchTitle">{title}</h1>
            <p className="workbenchDesc">{desc}</p>
          </div>
          <div className="workbenchStatus">
            <span>Status</span>
            <strong>{status}</strong>
          </div>
        </div>

        <div className="workbenchGrid">
          <section className="workbenchPanel workbenchPanel--wide">
            <div className="workbenchPanelHead">
              <span>Operational Fit</span>
              <b>2026 dashboard pattern</b>
            </div>
            <div className="workbenchFlow">
              <div>
                <span>State</span>
                <strong>Collect source</strong>
              </div>
              <div>
                <span>Delta</span>
                <strong>Compare signal</strong>
              </div>
              <div>
                <span>Action</span>
                <strong>Export evidence</strong>
              </div>
            </div>
          </section>

          <section className="workbenchPanel">
            <div className="workbenchPanelHead">
              <span>Signals</span>
            </div>
            <div className="workbenchSignals">
              {visibleSignals.map((item) => (
                <div key={`${item.label}-${item.value}`} className="workbenchSignal">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="workbenchPanel workbenchPanel--wide">
            <div className="workbenchPanelHead">
              <span>Next Build Checklist</span>
            </div>
            <div className="workbenchChecklist">
              {checks.map((item) => (
                <div key={item} className="workbenchCheck">
                  <span aria-hidden="true">✓</span>
                  {item}
                </div>
              ))}
            </div>
          </section>

          <section className="workbenchPanel workbenchPanel--actions">
            <a className="btn primary" href={primaryHref}>{primaryLabel}</a>
            <a className="btn" href={secondaryHref}>{secondaryLabel}</a>
          </section>
        </div>
      </div>
    </section>
  )
}
