import React from 'react'
import ToolCard from '../../components/ToolCard.jsx'
import { tools, preloadTool } from '../../tools'
import './HomeDynatrace.css'

const workflow = [
  { step: '01', title: 'Collect evidence', text: 'Upload WP-SCOUT, ST03N exports, SM21/ST22 or dev_w logs.' },
  { step: '02', title: 'Rank offenders', text: 'Separate CRIT/WARN signals by RSS, age, DB share, wait, recurrence, and anomaly.' },
  { step: '03', title: 'Correlate RCA', text: 'Connect WP pressure, workload spikes, dump/syslog patterns, and action notes.' },
  { step: '04', title: 'Export report', text: 'Generate clean evidence output for Basis escalation, management, or audit trail.' },
]

const signalCards = [
  { label: 'Core tools', value: '3', tone: 'good', hint: 'Only RCA modules visible' },
  { label: 'Evidence API', value: '/sap-api', tone: 'blue', hint: 'Server-side storage path' },
  { label: 'PDF output', value: 'Clean', tone: 'good', hint: 'Print-safe report layout' },
  { label: 'Runtime hacks', value: '0', tone: 'ok', hint: 'No DOM injector / observer' },
]

const toolHints = {
  comparer: ['SM50 / SM66', 'RSS / AGE / HOST', 'WP offender queue'],
  analyzer: ['ST03N / STAD', 'DB share / wait', 'TCode ranking'],
  logs: ['SM21 / ST22', 'dev_w trace', 'Pattern correlation'],
}

export default function Home() {
  const [q, setQ] = React.useState(() => localStorage.getItem('sap_q') || '')

  React.useEffect(() => {
    localStorage.setItem('sap_q', q)
  }, [q])

  React.useEffect(() => {
    tools.forEach((tool) => preloadTool?.(tool.slug))
  }, [])

  const filtered = React.useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return tools
    return tools.filter((t) => `${t.title} ${t.short} ${t.slug}`.toLowerCase().includes(s))
  }, [q])

  return (
    <section className="sapObsHome">
      <div className="sapObsHero">
        <div className="sapObsHeroCopy">
          <div className="sapObsPill"><span className="liveDot" /> SAP Basis Observability</div>
          <h1>RCA cockpit for SAP evidence, workload, and log correlation.</h1>
          <p>
            Dynatrace-style workspace for fast Basis triage: identify primary suspect,
            validate workload pressure, correlate logs, and export evidence cleanly.
          </p>
          <div className="sapObsHeroActions">
            <a className="sapObsBtn primary" href="#/tool/comparer">Open WP-SCOUT Monitor</a>
            <a className="sapObsBtn secondary" href="#/tool/analyzer">Analyze ST03N Workload</a>
            <a className="sapObsBtn ghost" href="#/tool/logs">Triage SM21 / ST22</a>
          </div>
        </div>

        <aside className="sapObsCommand">
          <div className="commandTop">
            <span>Investigation Command</span>
            <strong>RCA Flow</strong>
          </div>
          <div className="miniTrace">
            <span className="traceHigh" />
            <span className="traceMid" />
            <span className="traceLow" />
            <span className="traceMid" />
            <span className="traceHigh" />
          </div>
          <div className="commandGrid">
            <div><span>Signal source</span><strong>WP + ST03N + Logs</strong></div>
            <div><span>Default mode</span><strong>Evidence-first</strong></div>
            <div><span>Storage</span><strong>Server API</strong></div>
            <div><span>Output</span><strong>RCA PDF</strong></div>
          </div>
        </aside>
      </div>

      <div className="sapObsSignals">
        {signalCards.map((item) => (
          <div className={`sapObsSignal ${item.tone}`} key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.hint}</small>
          </div>
        ))}
      </div>

      <div className="sapObsLauncher">
        <div className="launcherCopy">
          <span className="sapObsKicker">Core RCA Tools</span>
          <h2>SAP investigation modules</h2>
          <p>Search and open only the three supported RCA tools. Legacy helper modules remain hidden.</p>
        </div>
        <div className="sapObsSearch">
          <span>⌕</span>
          <input placeholder="Search WP-SCOUT, ST03N, SM21, ST22..." value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button type="button" onClick={() => setQ('')}>×</button>}
        </div>
      </div>

      <div className="sapObsToolGrid">
        {filtered.map((tool) => (
          <div className="sapObsToolWrap" key={tool.slug}>
            <ToolCard
              slug={tool.slug}
              icon={tool.icon}
              title={tool.title}
              desc={tool.short}
              href={`#/tool/${tool.slug}`}
              onMouseEnter={() => preloadTool?.(tool.slug)}
            />
            <div className="toolHintRow">
              {(toolHints[tool.slug] || []).map((hint) => <span key={hint}>{hint}</span>)}
            </div>
          </div>
        ))}
      </div>

      <div className="sapObsBottomGrid">
        <section className="sapObsWorkflow">
          <div className="sectionTitle">
            <span className="sapObsKicker">Recommended Flow</span>
            <h2>From symptom to RCA evidence</h2>
          </div>
          <div className="workflowList">
            {workflow.map((item) => (
              <div className="workflowItem" key={item.step}>
                <span className="workflowStep">{item.step}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="sapObsEvidence">
          <div className="sectionTitle">
            <span className="sapObsKicker">Evidence Server</span>
            <h2>Stored on backend</h2>
          </div>
          <div className="evidenceStack">
            <div><span>Public health</span><code>/sap-api/health</code></div>
            <div><span>Evidence list</span><code>/sap-api/evidence</code></div>
            <div><span>Upload endpoint</span><code>/sap-api/upload</code></div>
          </div>
          <p>Gunakan Evidence History untuk memastikan file evidence tersimpan di server sebelum report dikirim.</p>
        </section>
      </div>
    </section>
  )
}
