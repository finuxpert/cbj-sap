import React from 'react'
import { getMobileCase } from '../../evidence-api-client.js'
import CaseDetail from './CaseDetail.jsx'
import CaseAnalytics from './CaseAnalytics.jsx'

function normalizeCase(payload) {
  return payload?.case || payload?.item || payload || null
}

export default function CaseDetailWithAnalytics({ caseId }) {
  const [caseData, setCaseData] = React.useState(null)

  React.useEffect(() => {
    let active = true
    if (!caseId) return undefined

    getMobileCase(caseId)
      .then((payload) => {
        if (!active || payload?.ok === false) return
        setCaseData(normalizeCase(payload))
      })
      .catch(() => {
        if (active) setCaseData(null)
      })

    return () => {
      active = false
    }
  }, [caseId])

  return (
    <>
      <CaseDetail caseId={caseId} />
      {caseData && (
        <section className="caseDetailPage container section caseDetailAnalyticsMount">
          <CaseAnalytics caseData={caseData} />
        </section>
      )}
    </>
  )
}
