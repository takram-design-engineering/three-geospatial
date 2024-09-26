import axios, { isAxiosError, type AxiosRequestConfig } from 'axios'

// https://cesium.com/learn/ion/rest-api/#operation/getAssetEndpoint
interface AssetEndpoint {
  type: string
  url: string
  accessToken: string
}

export interface IonAssetParams {
  assetId: number
  apiToken: string
}

export class IonAsset {
  readonly assetId: number
  private endpointPromise?: Promise<AssetEndpoint>

  constructor(private readonly params: Readonly<IonAssetParams>) {
    this.assetId = params.assetId
  }

  async fetch<T>(url: string, options?: AxiosRequestConfig<T>): Promise<T> {
    const asset = await (this.endpointPromise ?? this.loadEndpoint())
    const href = new URL(url, asset.url).href
    try {
      const response = await axios<T>(href, {
        ...options,
        headers: {
          ...options?.headers,
          Authorization: `Bearer ${asset.accessToken}`
        }
      })
      return response.data
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        this.endpointPromise = undefined
        return await this.fetch(href, options)
      }
      throw error
    }
  }

  private async loadEndpoint(): Promise<AssetEndpoint> {
    if (this.endpointPromise == null) {
      this.endpointPromise = (async () => {
        const response = await axios<AssetEndpoint>(
          `https://api.cesium.com/v1/assets/${this.params.assetId}/endpoint`,
          {
            params: {
              access_token: this.params.apiToken
            }
          }
        )
        return response.data
      })()
    }
    return await this.endpointPromise
  }
}
