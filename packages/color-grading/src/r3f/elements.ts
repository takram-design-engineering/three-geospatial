import { styled } from './utils'

import { iconButton, inputLabel, rangeInput, textInput } from './elements.css'

export const IconButton = /*#__PURE__*/ styled('button', iconButton)

export const InputLabel = /*#__PURE__*/ styled('label', inputLabel)

export const RangeInput = /*#__PURE__*/ styled('input', rangeInput, {
  type: 'range'
})

export const TextInput = /*#__PURE__*/ styled('input', textInput, {
  type: 'text',
  autoComplete: 'off'
})
