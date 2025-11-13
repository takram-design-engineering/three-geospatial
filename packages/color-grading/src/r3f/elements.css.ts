import { style } from '@vanilla-extract/css'

export const inputLabel = /*#__PURE__*/ style({
  color: '#ccc',
  fontSize: '11px',
  lineHeight: '16px',
  letterSpacing: '0.03em'
})

export const iconButton = /*#__PURE__*/ style({
  appearance: 'none',
  margin: '0',
  padding: '0',
  border: 'none',
  color: '#666',
  backgroundColor: 'transparent',
  selectors: {
    '&:hover, &:focus-visible': {
      outline: 'none',
      color: '#ccc'
    }
  }
})

export const rangeInput = /*#__PURE__*/ style({
  appearance: 'none',
  width: '100%',
  height: '12px',
  minWidth: '120px',
  margin: '0',
  background: 'none',
  selectors: {
    '&::-webkit-slider-runnable-track': {
      height: '8px',
      margin: '0 -1px',
      border: 'solid 1px #333',
      borderRadius: '4px',
      backgroundColor: '#111'
    },
    '&::-webkit-slider-thumb': {
      appearance: 'none',
      width: '16px',
      height: '12px',
      marginTop: '-3px',
      borderRadius: '4px',
      backgroundColor: '#999',
      boxShadow: '0 1px 3px rgb(0 0 0 / 0.5)'
    },
    '&:hover::-webkit-slider-thumb, &:focus-visible::-webkit-slider-thumb': {
      backgroundColor: '#ccc'
    },
    '&:hover, &:focus-visible': {
      outline: 'none'
    }
  }
})

export const textInput = /*#__PURE__*/ style({
  boxSizing: 'border-box',
  height: '24px',
  minWidth: '36px',
  outline: 'solid 1px #333',
  border: 'none',
  borderRadius: '4px',
  color: '#ccc',
  backgroundColor: '#111',
  fontSize: '11px',
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'center',
  selectors: {
    '&:focus-visible': {
      outline: 'solid 1px #666',
      border: 'solid 1px #666'
    }
  }
})
