const STYLE_ID = 'enterprise-rca-phase3-runtime-style'

const phase3Css = String.raw`
/* Phase 3 QA hotfix: remove duplicated pseudo titles and prevent toolbar overlap. */
.evidenceToolShell.finalRcaTool .evidenceToolbar{
  margin:0 auto 12px!important;
  width:auto!important;
  max-width:1440px!important;
  justify-content:flex-start!important;
  flex-wrap:wrap!important;
  position:relative!important;
  z-index:5!important;
}
.evidenceToolShell.finalRcaTool .evidenceHero{
  margin-bottom:8px!important;
}
.evidenceToolShell.finalRcaTool .evidenceUpload{
  margin-left:auto!important;
}

/* ST03N title cleanup */
.st03nImpactShell .interpretationPanel .panelTitleRow h2,
.st03nImpactShell .st03nBreakdownPanel .panelTitleRow h2,
.st03nImpactShell .basisBreakdownPanel .panelTitleRow h2,
.st03nImpactShell .st03nDashboardBoard>div:nth-child(1) .panelTitleRow h2,
.st03nImpactShell .st03nDashboardBoard>div:nth-child(2) .panelTitleRow h2,
.st03nImpactShell .st03nDashboardBoard>div:nth-child(3) .panelTitleRow h2{
  font-size:0!important;
  color:transparent!important;
}
.st03nImpactShell .interpretationPanel .panelTitleRow h2::after{content:'Basis Interpretation'!important;font-size:14px!important;color:#0f1f35!important;}
.st03nImpactShell .st03nBreakdownPanel .panelTitleRow h2::after,
.st03nImpactShell .basisBreakdownPanel .panelTitleRow h2::after{content:'Top Offender Queue'!important;font-size:14px!important;color:#0f1f35!important;}
.st03nImpactShell .st03nDashboardBoard>div:nth-child(1) .panelTitleRow h2::after{content:'Top Offender Split'!important;font-size:14px!important;color:#0f1f35!important;}
.st03nImpactShell .st03nDashboardBoard>div:nth-child(2) .panelTitleRow h2::after{content:'Response vs DB Impact'!important;font-size:14px!important;color:#0f1f35!important;}
.st03nImpactShell .st03nDashboardBoard>div:nth-child(3) .panelTitleRow h2::after{content:'Component Mix'!important;font-size:14px!important;color:#0f1f35!important;}

/* LOG title cleanup: force original title hidden before custom label. */
.logEvidenceShell .interpretationPanel .panelTitleRow h2,
.logEvidenceShell .logTopGrid .evidencePanel:nth-child(1) .panelTitleRow h2,
.logEvidenceShell .logTopGrid .evidencePanel:nth-child(2) .panelTitleRow h2,
.logEvidenceShell .evidenceGrid.triple.logCompactGrid .evidencePanel:nth-child(1) .panelTitleRow h2,
.logEvidenceShell .evidenceGrid.triple.logCompactGrid .evidencePanel:nth-child(2) .panelTitleRow h2,
.logEvidenceShell .evidenceGrid.triple.logCompactGrid .evidencePanel:nth-child(3) .panelTitleRow h2,
.logEvidenceShell .evidenceGrid.wide.logCompactGrid .evidencePanel:nth-child(1) .panelTitleRow h2,
.logEvidenceShell .evidenceGrid.wide.logCompactGrid .evidencePanel:nth-child(2) .panelTitleRow h2,
.logEvidenceShell .logMetricPanel .panelTitleRow h2,
.logEvidenceShell .infraChartGrid .evidencePanel:nth-child(1) .panelTitleRow h2,
.logEvidenceShell .infraChartGrid .evidencePanel:nth-child(2) .panelTitleRow h2,
.logEvidenceShell .infraChartGrid .evidencePanel:nth-child(3) .panelTitleRow h2,
.logEvidenceShell .evidenceGrid.triple:not(.logCompactGrid):not(.infraChartGrid) .evidencePanel:nth-child(1) .panelTitleRow h2,
.logEvidenceShell .evidenceGrid.triple:not(.logCompactGrid):not(.infraChartGrid) .evidencePanel:nth-child(3) .panelTitleRow h2{
  font-size:0!important;
  color:transparent!important;
}
.logEvidenceShell .interpretationPanel .panelTitleRow h2::after{content:'RCA Insight'!important;font-size:14px!important;color:#0f1f35!important;}
.logEvidenceShell .logTopGrid .evidencePanel:nth-child(1) .panelTitleRow h2::after{content:'Top Error Code'!important;font-size:14px!important;color:#0f1f35!important;}
.logEvidenceShell .logTopGrid .evidencePanel:nth-child(2) .panelTitleRow h2::after{content:'Error Ranking'!important;font-size:14px!important;color:#0f1f35!important;}
.logEvidenceShell .evidenceGrid.triple.logCompactGrid .evidencePanel:nth-child(1) .panelTitleRow h2::after{content:'Error Family Mix'!important;font-size:14px!important;color:#0f1f35!important;}
.logEvidenceShell .evidenceGrid.triple.logCompactGrid .evidencePanel:nth-child(2) .panelTitleRow h2::after{content:'Owner Direction'!important;font-size:14px!important;color:#0f1f35!important;}
.logEvidenceShell .evidenceGrid.triple.logCompactGrid .evidencePanel:nth-child(3) .panelTitleRow h2::after{content:'Program Impact'!important;font-size:14px!important;color:#0f1f35!important;}
.logEvidenceShell .evidenceGrid.wide.logCompactGrid .evidencePanel:nth-child(1) .panelTitleRow h2::after{content:'Time Window Trend'!important;font-size:14px!important;color:#0f1f35!important;}
.logEvidenceShell .evidenceGrid.wide.logCompactGrid .evidencePanel:nth-child(2) .panelTitleRow h2::after{content:'Host Signal'!important;font-size:14px!important;color:#0f1f35!important;}
.logEvidenceShell .logMetricPanel .panelTitleRow h2::after{content:'WP Memory Pressure'!important;font-size:14px!important;color:#0f1f35!important;}
.logEvidenceShell .infraChartGrid .evidencePanel:nth-child(1) .panelTitleRow h2::after{content:'Severity Distribution'!important;font-size:14px!important;color:#0f1f35!important;}
.logEvidenceShell .infraChartGrid .evidencePanel:nth-child(2) .panelTitleRow h2::after{content:'WP Type Mix'!important;font-size:14px!important;color:#0f1f35!important;}
.logEvidenceShell .infraChartGrid .evidencePanel:nth-child(3) .panelTitleRow h2::after{content:'WP State Mix'!important;font-size:14px!important;color:#0f1f35!important;}
.logEvidenceShell .evidenceGrid.triple:not(.logCompactGrid):not(.infraChartGrid) .evidencePanel:nth-child(1) .panelTitleRow h2::after{content:'Top Job Name'!important;font-size:14px!important;color:#0f1f35!important;}
.logEvidenceShell .evidenceGrid.triple:not(.logCompactGrid):not(.infraChartGrid) .evidencePanel:nth-child(3) .panelTitleRow h2::after{content:'Recommended Action'!important;font-size:14px!important;color:#0f1f35!important;}

/* LOG: remove duplicated/faded RCA insight panel; the summary already exists in KPI cards. */
.logEvidenceShell > .evidenceGrid:first-of-type .interpretationPanel{
  display:none!important;
}
.logEvidenceShell > .evidenceGrid:first-of-type{
  grid-template-columns:1fr!important;
}
.logEvidenceShell > .evidenceGrid:first-of-type .evidencePanel{
  max-width:none!important;
}

/* Readability improvement for chart labels and long text blocks. */
.evidenceToolShell.finalRcaTool .evidenceList span,
.evidenceToolShell.finalRcaTool .evidenceList small,
.evidenceToolShell.finalRcaTool .statusList span,
.evidenceToolShell.finalRcaTool td,
.evidenceToolShell.finalRcaTool th{
  opacity:1!important;
}
.evidenceToolShell.finalRcaTool .evidencePanel,
.evidenceToolShell.finalRcaTool .decisionCard,
.evidenceToolShell.finalRcaTool .st03nKpiCard{
  overflow:hidden!important;
}

@media(max-width:1180px){
  .evidenceToolShell.finalRcaTool .evidenceToolbar{width:100%!important;}
}
`

export function installEnterpriseRcaPhase3() {
  if (typeof document === 'undefined') return
  const existing = document.getElementById(STYLE_ID)
  if (existing) {
    existing.textContent = phase3Css
    return
  }
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.setAttribute('data-origin', 'compact-rca-phase3')
  style.textContent = phase3Css
  document.head.appendChild(style)
}
