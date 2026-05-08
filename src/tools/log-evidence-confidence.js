export function confidenceLabel(confidence, rows = [], primary = null) {
  if (!primary) return 'No classified error pattern found.'
  if (rows.length < 3) return 'Low sample size; treat as initial clue, not final RCA.'
  if (confidence >= 75) return 'Strong pattern from uploaded log evidence.'
  if (confidence >= 45) return 'Moderate pattern; verify with ST03N/WP-SCOUT timeline.'
  return 'Weak pattern; evidence is partial.'
}
