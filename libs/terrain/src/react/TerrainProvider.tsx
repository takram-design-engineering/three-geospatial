import { createContext, useMemo, type FC, type ReactNode } from 'react'

import { IonAsset, type IonAssetParams } from '../IonAsset'

export interface TerrainContextValue {
  asset: IonAsset
}

export const TerrainContext = createContext<TerrainContextValue | null>(null)

export interface TerrainProviderProps extends IonAssetParams {
  children?: ReactNode
}

export const TerrainProvider: FC<TerrainProviderProps> = ({
  assetId,
  apiToken,
  children
}) => {
  const context = useMemo(
    () => ({ asset: new IonAsset({ assetId, apiToken }) }),
    [assetId, apiToken]
  )
  return (
    <TerrainContext.Provider value={context}>
      {children}
    </TerrainContext.Provider>
  )
}
