import React from 'react'

export default function JobProgramMappingPanel({ primary }) {
  return (
    <section className="evidencePanel">
      <h2>Error → Job / Program Mapping</h2>
      {primary ? (
        <div className="evidenceList compact">
          <div>
            <b>Jobs</b>
            <span>{primary.jobs?.join(' · ') || 'No job extracted'}</span>
          </div>
          <div>
            <b>Programs</b>
            <span>{primary.programs?.join(' · ') || 'No program extracted'}</span>
          </div>
          <div>
            <b>Seen at</b>
            <span>{primary.times?.join(', ') || 'No timestamp extracted'}</span>
          </div>
        </div>
      ) : (
        <p>Upload logs to map errors to jobs and programs.</p>
      )}
    </section>
  )
}
