import { atom, type SetStateAction } from 'jotai'

export const cesiumIonTokenAtom = atom('')
export const googleMapsApiKeyAtom = atom('')

export const needsApiKeyPrimitiveAtom = atom(false)
export const needsApiKeyAtom = atom(
  get =>
    get(needsApiKeyPrimitiveAtom) &&
    get(cesiumIonTokenAtom) === '' &&
    get(googleMapsApiKeyAtom) === '',
  (get, set, value: SetStateAction<boolean>) => {
    set(needsApiKeyPrimitiveAtom, value)
  }
)
