import { atom } from 'jotai'

export const googleMapsApiKeyAtom = atom(
  import.meta.env.STORYBOOK_GOOGLE_MAP_API_KEY ?? ''
)
