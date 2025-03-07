import { atom, type SetStateAction } from 'jotai'

export const googleMapsApiKeyAtom = atom('')

export const needsApiKeyPrimitiveAtom = atom(false)
export const needsApiKeyAtom = atom(
  get => get(needsApiKeyPrimitiveAtom) && get(googleMapsApiKeyAtom) === '',
  (get, set, value: SetStateAction<boolean>) => {
    set(needsApiKeyPrimitiveAtom, value)
  }
)
