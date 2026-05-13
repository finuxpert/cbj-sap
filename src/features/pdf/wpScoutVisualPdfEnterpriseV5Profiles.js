export const WP_SCOUT_PDF_V5_PROFILE_IDS = {
  executive: 'executive',
  standard: 'standard',
  full: 'full',
}

const profiles = {
  [WP_SCOUT_PDF_V5_PROFILE_IDS.executive]: {
    id: WP_SCOUT_PDF_V5_PROFILE_IDS.executive,
    label: 'Executive Summary',
    description: 'Short management-readable RCA PDF with cover, index, narrative, KPI, and action checklist.',
    includeSections: ['cover', 'index', 'narrative', 'kpi-delta', 'checklist'],
    appendixRowCap: 0,
    groupedAppendix: false,
    intendedAudience: 'Management / Basis Lead',
  },
  [WP_SCOUT_PDF_V5_PROFILE_IDS.standard]: {
    id: WP_SCOUT_PDF_V5_PROFILE_IDS.standard,
    label: 'Standard RCA Report',
    description: 'Balanced operational RCA report with data quality, KPI comparison, checklist, and grouped evidence appendix.',
    includeSections: ['cover', 'index', 'narrative', 'data-quality', 'kpi-delta', 'checklist', 'appendix'],
    appendixRowCap: 36,
    groupedAppendix: true,
    intendedAudience: 'Basis / Infrastructure / Incident Mgmt',
  },
  [WP_SCOUT_PDF_V5_PROFILE_IDS.full]: {
    id: WP_SCOUT_PDF_V5_PROFILE_IDS.full,
    label: 'Full Evidence Report',
    description: 'Maximum evidence-oriented RCA export for deeper incident investigation and audit attachment.',
    includeSections: ['cover', 'index', 'narrative', 'data-quality', 'kpi-delta', 'checklist', 'appendix'],
    appendixRowCap: 72,
    groupedAppendix: true,
    intendedAudience: 'Basis Reviewer / Incident Forensics',
  },
}

export function normalizeWpScoutPdfProfile(profileId = WP_SCOUT_PDF_V5_PROFILE_IDS.standard) {
  return profiles[profileId] || profiles[WP_SCOUT_PDF_V5_PROFILE_IDS.standard]
}

export function resolveWpScoutPdfProfileFromDom(root) {
  const requested = root?.querySelector?.('[data-pdf-profile]')?.getAttribute?.('data-pdf-profile')
    || root?.getAttribute?.('data-pdf-profile')
    || root?.dataset?.pdfProfile

  return normalizeWpScoutPdfProfile(requested)
}

export function isSectionEnabledForProfile(sectionId, profile) {
  return Boolean(profile?.includeSections?.includes(sectionId))
}
