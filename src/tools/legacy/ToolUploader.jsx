import React from 'react'
import ToolWorkbench from '../../components/ToolWorkbench.jsx'

export default function ToolUploader(){
  return (
    <ToolWorkbench
      title="Upload Intake"
      desc="Normalize SAP exports, logs, and daily-check files before they enter analysis or comparison workflows."
      status="Parsing intake"
      primaryHref="#/tool/analyzer"
      primaryLabel="Analyze Export"
      signals={[
        { label: 'Files', value: 'XLSX/CSV/LOG' },
        { label: 'Validation', value: 'Header map' },
        { label: 'Output', value: 'Parsed model' },
      ]}
      checks={[
        'Validate required headers before analysis',
        'Show parse errors as actionable fixes',
        'Route clean data to Analyzer or RCA Logs',
      ]}
    />
  )
}
