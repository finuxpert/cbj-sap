const STYLE_ID = 'enterprise-rca-phase4-runtime-style'

const phase4Css = String.raw`
/* Phase 4: small polish only. Keep existing data flow and dashboard structure. */
.evidenceToolShell.finalRcaTool{
  padding-top:16px!important;
}
.evidenceToolShell.finalRcaTool .evidenceHero{
  min-height:58px!important;
  padding-top:11px!important;
  padding-bottom:11px!important;
  border-radius:14px!important;
}
.evidenceToolShell.finalRcaTool .heroCopyBlock span::after{
  font-size:20px!important;
  letter-spacing:-.025em!important;
}
.evidenceToolShell.finalRcaTool .evidenceHero p{
  margin-top:2px!important;
  max-width:880px!important;
  line-height:1.28!important;
}
.evidenceToolShell.finalRcaTool .evidenceHero p::after{
  font-size:11.5px!important;
}
.evidenceToolShell.finalRcaTool .evidenceUpload{
  min-width:166px!important;
  min-height:36px!important;
  font-size:12px!important;
}
.evidenceToolShell.finalRcaTool .evidenceToolbar{
  gap:8px!important;
  margin-bottom:10px!important;
}
.evidenceToolShell.finalRcaTool .evidenceToolbar button,
.evidenceToolShell.finalRcaTool .evidenceToolbar a{
  min-height:34px!important;
  padding:0 13px!important;
  font-size:11.5px!important;
}
.evidenceToolShell.finalRcaTool .decisionBoard.finalDecisionBoard{
  grid-template-columns:repeat(4,minmax(0,1fr))!important;
  gap:9px!important;
}
.evidenceToolShell.finalRcaTool .decisionCard{
  min-height:68px!important;
  padding:10px 12px!important;
}
.evidenceToolShell.finalRcaTool .decisionCard b{
  font-size:clamp(16px,1.35vw,21px)!important;
}
.evidenceToolShell.finalRcaTool .decisionCard small{
  max-width:none!important;
}
.evidenceToolShell.finalRcaTool .evidenceGrid,
.evidenceToolShell.finalRcaTool .evidenceGrid.wide,
.evidenceToolShell.finalRcaTool .evidenceGrid.triple,
.evidenceToolShell.finalRcaTool .st03nSummaryGrid,
.evidenceToolShell.finalRcaTool .st03nDashboardBoard,
.evidenceToolShell.finalRcaTool .st03nFooterGrid{
  gap:9px!important;
  margin-bottom:9px!important;
}
.evidenceToolShell.finalRcaTool .evidencePanel{
  border-radius:13px!important;
  padding:11px!important;
}
.evidenceToolShell.finalRcaTool .panelTitleRow{
  padding-bottom:6px!important;
  margin-bottom:7px!important;
}
.evidenceToolShell.finalRcaTool .panelTitleRow h2::before{
  transform:translateY(-1px)!important;
}
.evidenceToolShell.finalRcaTool .panelTitleRow span{
  white-space:nowrap!important;
}

/* ST03N: make first chart less empty and reduce early page height. */
.st03nImpactShell .st03nSummaryGrid{
  grid-template-columns:minmax(0,1.08fr) minmax(360px,.92fr)!important;
}
.st03nImpactShell .parsePanel .statusList div{
  min-height:50px!important;
}
.st03nImpactShell .st03nDashboardBoard>div:nth-child(1){
  grid-column:span 4!important;
}
.st03nImpactShell .st03nDashboardBoard>div:nth-child(2){
  grid-column:span 8!important;
}
.st03nImpactShell .st03nDashboardBoard>div:nth-child(1) .visual>div,
.st03nImpactShell .st03nDashboardBoard>div:nth-child(1) div[style*="height"]{
  height:190px!important;
}
.st03nImpactShell .st03nDashboardBoard>div:nth-child(2) .visual>div,
.st03nImpactShell .st03nDashboardBoard>div:nth-child(2) div[style*="height"]{
  height:215px!important;
}
.st03nImpactShell .st03nDashboardBoard>div:nth-child(3){
  grid-column:span 4!important;
}
.st03nImpactShell .st03nDashboardBoard>div:nth-child(5){
  grid-column:span 8!important;
}
.st03nImpactShell .st03nDashboardBoard>div:nth-child(6){
  grid-column:span 12!important;
}
.st03nImpactShell .basisBreakdownList,
.st03nImpactShell .st03nCompactList{
  max-height:220px!important;
}

/* LOG: restore neat 4-card KPI strip and reduce empty gap. */
.logEvidenceShell .finalDecisionBoard{
  grid-template-columns:repeat(4,minmax(0,1fr))!important;
  align-items:stretch!important;
}
.logEvidenceShell .finalDecisionBoard .decisionCard{
  display:grid!important;
  width:100%!important;
  min-width:0!important;
}
.logEvidenceShell .finalDecisionBoard .decisionCard:nth-child(3){
  display:grid!important;
  visibility:visible!important;
  opacity:1!important;
}
.logEvidenceShell > .evidenceGrid:first-of-type{
  grid-template-columns:minmax(0,1fr) minmax(420px,.88fr)!important;
}
.logEvidenceShell > .evidenceGrid:first-of-type .interpretationPanel{
  display:block!important;
}
.logEvidenceShell .interpretationPanel{
  min-height:128px!important;
}
.logEvidenceShell .confidenceRows{
  grid-template-columns:repeat(3,minmax(0,1fr))!important;
}
.logEvidenceShell .logTopGrid{
  grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;
}
.logEvidenceShell .logTopGrid .visual>div,
.logEvidenceShell .logTopGrid div[style*="height"]{
  height:215px!important;
}
.logEvidenceShell .chartMiniGrid div[style*="height"],
.logEvidenceShell .logCompactGrid div[style*="height"],
.logEvidenceShell .infraChartGrid div[style*="height"]{
  height:185px!important;
}
.logEvidenceShell .evidenceGrid.triple:not(.logCompactGrid):not(.infraChartGrid){
  grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;
}
.logEvidenceShell .evidenceGrid.triple:not(.logCompactGrid):not(.infraChartGrid) .evidencePanel:nth-child(2){
  display:none!important;
}

@media(max-width:1180px){
  .evidenceToolShell.finalRcaTool .decisionBoard.finalDecisionBoard,
  .st03nImpactShell .st03nSummaryGrid,
  .logEvidenceShell > .evidenceGrid:first-of-type,
  .logEvidenceShell .logTopGrid{
    grid-template-columns:1fr!important;
  }
  .st03nImpactShell .st03nDashboardBoard>div,
  .st03nImpactShell .st03nDashboardBoard>div:nth-child(1),
  .st03nImpactShell .st03nDashboardBoard>div:nth-child(2),
  .st03nImpactShell .st03nDashboardBoard>div:nth-child(3),
  .st03nImpactShell .st03nDashboardBoard>div:nth-child(5),
  .st03nImpactShell .st03nDashboardBoard>div:nth-child(6){
    grid-column:span 12!important;
  }
}
`

export function installEnterpriseRcaPhase4() {
  if (typeof document === 'undefined') return
  const existing = document.getElementById(STYLE_ID)
  if (existing) {
    existing.textContent = phase4Css
    return
  }
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.setAttribute('data-origin', 'compact-rca-phase4')
  style.textContent = phase4Css
  document.head.appendChild(style)
}
