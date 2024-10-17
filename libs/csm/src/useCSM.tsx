import { useContext } from 'react'

import { type CascadedShadowMaps } from './CascadedShadowMaps'
import { CSMContext } from './CSM'

export function useCSM(): CascadedShadowMaps {
  const context = useContext(CSMContext)
  if (context == null) {
    throw new Error('CSM: Hooks can only be used within the CSM component!')
  }
  return context.csm
}
