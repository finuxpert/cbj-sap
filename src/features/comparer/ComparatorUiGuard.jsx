import React from 'react'

export default function ComparatorUiGuard() {
  React.useEffect(() => {
    import('../../tools/ToolComparer.clean.css')
  }, [])

  return null
}
