import React from 'react'
import ToolWorkbench from '../components/ToolWorkbench.jsx'

export default function ToolRollback(){
  return (
    <ToolWorkbench
      title="Rollback Desk"
      desc="Keep fallback steps, system state, and post-rollback evidence structured for incident or change recovery."
      status="Recovery ready"
      primaryHref="#/tool/logs"
      primaryLabel="Inspect Logs"
      signals={[
        { label: 'Trigger', value: 'Decision gate' },
        { label: 'Owner', value: 'Basis' },
        { label: 'Evidence', value: 'Before/after' },
      ]}
      checks={[
        'Define rollback trigger conditions before deploy',
        'Capture pre and post system checks',
        'Prepare stakeholder update text from evidence',
      ]}
    />
  )
}
