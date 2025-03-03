import React, { useEffect, useRef } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({
  startOnLoad: true,
  theme: 'dark',
  securityLevel: 'loose',
})

export default function WorkflowDiagram({ currentStep }) {
  const mermaidRef = useRef(null)

  useEffect(() => {
    if (mermaidRef.current) {
      mermaid.contentLoaded()
    }
  }, [currentStep])

  const diagramDefinition = `
    graph TD
      A[User accesses Knowledge Base configuration]
      B[Step 1: Connect to Google Drive / Upload Files]
      C[List available documents]
      D[User selects/removes documents]
      E[Step 2: Connect to Supabase]
      F[List available Supabase tables]
      G[User selects target table for vectorisation]
      H[Step 3: Backend Vectorises Document Content]
      I[Store vectorised data in selected Supabase table]
      J[Final Knowledge Base Ready]

      A --> B
      B --> C
      C --> D
      D --> E
      E --> F
      F --> G
      G --> H
      H --> I
      I --> J

      style ${['B', 'E', 'H'][currentStep - 1]} fill:#f9f,stroke:#333,stroke-width:4px
  `

  return (
    <div className="workflow-diagram">
      <div className="mermaid" ref={mermaidRef}>
        {diagramDefinition}
      </div>
    </div>
  )
}
