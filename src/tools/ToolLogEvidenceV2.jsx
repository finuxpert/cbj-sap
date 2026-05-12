import React from 'react'
import {
  buildOwnerAction,
  expandZipAwareFiles,
  fileExt,
  latestRcaSession,
  loadJson,
  safe,
  saveJson,
} from './evidence-utils.js'
import { buildLogEvidenceReportText } from './log-evidence-report.js'
import {
  EmptyState,
  EvidenceServerPanel,
  SessionBanner,
  UploadedFilesPanel,
} from './EvidenceDecisionKit.jsx'
import EvidenceToolbar from './EvidenceToolbar.jsx'
import ErrorEvidenceRanking from './logtriage/components/ErrorEvidenceRanking.jsx'
import JobProgramMappingPanel from './logtriage/components/JobProgramMappingPanel.jsx'
import PrimaryErrorPanel from './logtriage/components/PrimaryErrorPanel.jsx'
import ScoringBreakdownPanel from './logtriage/components/ScoringBreakdownPanel.jsx'
import SummaryStrip from './logtriage/components/SummaryStrip.jsx'
import { runEvidenceAnalysis } from './useEvidenceUpload.js'
import './ToolEvidenceSpecialist.css'

const LogEvidenceCharts = React.lazy(() => import('./LogEvidenceCharts.jsx'))

const CACHE_KEY = 'sap_log_evidence_v2_cache'
const CASE_KEY = 'sap_log_evidence_v2_case_id'

/* incremental patch only: scoring breakdown panel wired into existing layout */
