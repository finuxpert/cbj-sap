import React from 'react'
import ToolWorkbench from '../../components/ToolWorkbench.jsx'

export default function ToolBackup(){
  return (
    <ToolWorkbench
      title="Backup Control"
      desc="Prepare repeatable pre-change backup routines, retention checks, and evidence notes before SAP maintenance windows."
      status="Workflow blueprint"
      primaryHref="#/tool/logs"
      primaryLabel="Review Logs"
      signals={[
        { label: 'Backup window', value: 'Pre-change' },
        { label: 'Evidence', value: 'Retention note' },
        { label: 'Risk', value: 'Low if verified' },
      ]}
      checks={[
        'Capture backup timestamp and target system',
        'Record storage location and retention owner',
        'Attach verification evidence before release starts',
      ]}
    />
  )
}
