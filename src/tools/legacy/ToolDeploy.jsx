import React from 'react'
import ToolWorkbench from '../../components/ToolWorkbench.jsx'

export default function ToolDeploy(){
  return (
    <ToolWorkbench
      title="Deploy Readiness"
      desc="Coordinate transport, build, and release evidence with a compact readiness view for Basis and infra handoff."
      status="Release cockpit"
      primaryHref="#/tool/comparer"
      primaryLabel="Compare Checks"
      signals={[
        { label: 'Gate', value: 'Readiness' },
        { label: 'Fallback', value: 'Rollback linked' },
        { label: 'Evidence', value: 'Checklist' },
      ]}
      checks={[
        'Confirm source and target environment',
        'Attach daily-check baseline before change',
        'Keep rollback evidence one click away',
      ]}
    />
  )
}
