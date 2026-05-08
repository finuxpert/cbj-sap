import React from 'react'
import ToolWorkbench from '../../components/ToolWorkbench.jsx'

export default function ToolMetrics(){
  return (
    <ToolWorkbench
      title="Health Metrics"
      desc="Frame response time, DB share, roll wait, workload, and job health into operator-friendly KPI cards."
      status="Metric model"
      primaryHref="#/tool/analyzer"
      primaryLabel="Open Analyzer"
      signals={[
        { label: 'KPI layer', value: 'State' },
        { label: 'Trend layer', value: 'Delta' },
        { label: 'Ops layer', value: 'Action' },
      ]}
      checks={[
        'Prioritize KPIs that change operational decisions',
        'Use threshold bands for Basis triage',
        'Keep drilldown paths from KPI to offender table',
      ]}
    />
  )
}
