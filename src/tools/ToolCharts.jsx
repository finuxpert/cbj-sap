import React from 'react'
import ToolWorkbench from '../components/ToolWorkbench.jsx'

export default function ToolCharts(){
  return (
    <ToolWorkbench
      title="Visualization Lab"
      desc="Design trend, heatmap, and offender views for ST03N, WP, and application log evidence."
      status="Chart patterns"
      primaryHref="#/tool/analyzer"
      primaryLabel="Open Analyzer"
      signals={[
        { label: 'Charts', value: 'Trend first' },
        { label: 'Density', value: 'Compact' },
        { label: 'Tables', value: 'Sticky header' },
      ]}
      checks={[
        'Use line charts for time profile deltas',
        'Use ranked bars for top offenders',
        'Keep tables for exact handoff data',
      ]}
    />
  )
}
