import React from 'react'
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, LineChart, Line } from 'recharts'

export default function LogEvidenceCharts({ chartData = [], timeline = [] }) {
  return (
    <section className="evidencePanel chartPanel">
      <h2>Top ErrorCode</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="hits" radius={[8, 8, 0, 0]} />
          <Bar dataKey="crit" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      {timeline?.length ? (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={timeline}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line dataKey="hits" strokeWidth={3} />
            <Line dataKey="crit" strokeWidth={3} />
          </LineChart>
        </ResponsiveContainer>
      ) : null}
    </section>
  )
}
