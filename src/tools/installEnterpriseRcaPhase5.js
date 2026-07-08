const STYLE_ID = 'enterprise-rca-phase5-runtime-style'

const phase5Css = String.raw`
/* Phase 5: ST03N chart density fix. Removes large blank canvas areas without changing data. */
.st03nImpactShell .st03nDashboardBoard{
  align-items:start!important;
}
.st03nImpactShell .st03nDashboardBoard>div:nth-child(1){
  grid-column:span 4!important;
}
.st03nImpactShell .st03nDashboardBoard>div:nth-child(2){
  grid-column:span 5!important;
}
.st03nImpactShell .st03nDashboardBoard>div:nth-child(3){
  grid-column:span 3!important;
}
.st03nImpactShell .st03nDashboardBoard>div:nth-child(1) .evidencePanel,
.st03nImpactShell .st03nDashboardBoard>div:nth-child(2) .evidencePanel,
.st03nImpactShell .st03nDashboardBoard>div:nth-child(3) .evidencePanel{
  min-height:0!important;
  height:auto!important;
}
.st03nImpactShell .st03nDashboardBoard>div:nth-child(1) .evidencePanel{
  max-height:270px!important;
}
.st03nImpactShell .st03nDashboardBoard>div:nth-child(2) .evidencePanel{
  max-height:365px!important;
}
.st03nImpactShell .st03nDashboardBoard>div:nth-child(3) .evidencePanel{
  max-height:365px!important;
}
.st03nImpactShell .st03nDashboardBoard>div:nth-child(1) .evidencePanel .echarts-for-react,
.st03nImpactShell .st03nDashboardBoard>div:nth-child(1) .evidencePanel div[style*="height"]{
  height:178px!important;
  max-height:178px!important;
}
.st03nImpactShell .st03nDashboardBoard>div:nth-child(2) .evidencePanel .echarts-for-react,
.st03nImpactShell .st03nDashboardBoard>div:nth-child(2) .evidencePanel div[style*="height"]{
  height:205px!important;
  max-height:205px!important;
}
.st03nImpactShell .st03nDashboardBoard>div:nth-child(3) .evidencePanel .echarts-for-react,
.st03nImpactShell .st03nDashboardBoard>div:nth-child(3) .evidencePanel div[style*="height"]{
  height:230px!important;
  max-height:230px!important;
}
.st03nImpactShell .st03nDashboardBoard>div:nth-child(1) canvas,
.st03nImpactShell .st03nDashboardBoard>div:nth-child(2) canvas,
.st03nImpactShell .st03nDashboardBoard>div:nth-child(3) canvas{
  max-height:240px!important;
}
.st03nImpactShell .st03nDashboardBoard>div:nth-child(2) .evidenceList,
.st03nImpactShell .st03nDashboardBoard>div:nth-child(2) .st03nCompactList{
  max-height:116px!important;
  overflow:auto!important;
}
.st03nImpactShell .st03nDashboardBoard>div:nth-child(1) .panelTitleRow,
.st03nImpactShell .st03nDashboardBoard>div:nth-child(2) .panelTitleRow,
.st03nImpactShell .st03nDashboardBoard>div:nth-child(3) .panelTitleRow{
  margin-bottom:4px!important;
}
.st03nImpactShell .st03nDashboardBoard>div:nth-child(1) .panelTitleRow span,
.st03nImpactShell .st03nDashboardBoard>div:nth-child(2) .panelTitleRow span,
.st03nImpactShell .st03nDashboardBoard>div:nth-child(3) .panelTitleRow span{
  transform:scale(.92)!important;
  transform-origin:right center!important;
}

/* Put the detailed table underneath the three visual cards, full width. */
.st03nImpactShell .st03nDashboardBoard>div:nth-child(5),
.st03nImpactShell .st03nDashboardBoard>div:nth-child(6){
  grid-column:span 12!important;
}
.st03nImpactShell .st03nDashboardBoard>div:nth-child(5) .evidencePanel,
.st03nImpactShell .st03nDashboardBoard>div:nth-child(6) .evidencePanel{
  max-height:360px!important;
  overflow:auto!important;
}

@media(max-width:1180px){
  .st03nImpactShell .st03nDashboardBoard>div:nth-child(1),
  .st03nImpactShell .st03nDashboardBoard>div:nth-child(2),
  .st03nImpactShell .st03nDashboardBoard>div:nth-child(3),
  .st03nImpactShell .st03nDashboardBoard>div:nth-child(5),
  .st03nImpactShell .st03nDashboardBoard>div:nth-child(6){
    grid-column:span 12!important;
  }
}
`

export function installEnterpriseRcaPhase5() {
  if (typeof document === 'undefined') return
  const existing = document.getElementById(STYLE_ID)
  if (existing) {
    existing.textContent = phase5Css
    return
  }
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.setAttribute('data-origin', 'compact-rca-phase5')
  style.textContent = phase5Css
  document.head.appendChild(style)
}
