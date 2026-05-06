import React from 'react'

const labels = {
  comparer: 'Daily Ops',
  analyzer: 'Workload',
  backup: 'Recovery',
  deploy: 'Release',
  rollback: 'Recovery',
  logs: 'Triage',
  metrics: 'Health',
  charts: 'Visual',
  settings: 'Config',
  uploader: 'Import',
}

export default function ToolCard({ icon, title, desc, href, slug, ...props }){
  return (
    <a {...props} className="card toolCard" href={href}>
      <div className="toolCardTop">
        <span className="toolIcon" style={{width:38, height:38}}>{icon}</span>
        <div style={{minWidth:0}}>
          <h3 className="toolCardTitle">{title}</h3>
          <p className="toolCardDesc">{desc}</p>
        </div>
      </div>
      <div className="toolCardFoot">
        <span className="toolTag">{labels[slug] || 'Tool'}</span>
        <span className="toolCardGo" aria-hidden="true">→</span>
      </div>
    </a>
  )
}
