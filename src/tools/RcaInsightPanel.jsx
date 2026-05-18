import React from 'react'

export default function RcaInsightPanel() {
  const sections = [
    {
      title: 'Immediate Focus',
      items: [
        'Validate top CRIT PID in SM50/SM66.',
        'Confirm job owner and schedule in SM37.',
      ],
    },
    {
      title: 'Correlation Checks',
      items: [
        'Check ST22 and SM21 in the same timestamp window.',
        'Compare host memory pressure with the RSS spike.',
      ],
    },
    {
      title: 'Next Action',
      items: [
        'Attach PDF and raw evidence to the incident record.',
      ],
    },
  ]

  return (
    <section className="cmpRcaInsightPanel" aria-labelledby="cmp-rca-insight-title">
      <span className="cmpRcaInsightEyebrow">RCA Insight Panel</span>
      <h2 id="cmp-rca-insight-title">Basis validation checklist</h2>
      <div className="cmpRcaInsightSections">
        {sections.map((section) => (
          <div className="cmpRcaInsightSection" key={section.title}>
            <strong>{section.title}</strong>
            <ul>
              {section.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
