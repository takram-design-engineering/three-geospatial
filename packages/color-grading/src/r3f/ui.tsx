import styled from '@emotion/styled'
import type { FC } from 'react'

export const Input = /*#__PURE__*/ styled.input`
  box-sizing: border-box;
  height: 24px;
  min-width: 36px;
  outline: solid 1px #333;
  border: none;
  border-radius: 4px;
  color: #ccc;
  background-color: #111;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: center;

  &:focus-within {
    outline: solid 1px #666;
    border: solid 1px #666;
  }
`

export const Label = styled.label`
  color: #ccc;
  font-size: 11px;
  line-height: 16px;
  letter-spacing: 0.03em;
`

export const Slider = styled.input`
  appearance: none;
  width: 100%;
  height: 12px;
  min-width: 120px;
  margin: 0;
  background: none;

  &:focus {
    outline: none;
  }

  &::-webkit-slider-runnable-track {
    height: 8px;
    margin: 0 -1px;
    border: solid 1px #333;
    border-radius: 4px;
    background-color: #111;
  }

  &::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 12px;
    margin-top: -3px;
    border-radius: 4px;
    background-color: #999;
  }
`

export const IconButton = /*#__PURE__*/ styled.button`
  appearance: none;
  margin: 0;
  padding: 0;
  border: none;
  color: #666;
  background-color: transparent;
  cursor: pointer;

  &:hover,
  &:focus {
    outline: none;
    color: #ccc;
  }
`

export const ResetIcon: FC = () => (
  <svg
    xmlns='http://www.w3.org/2000/svg'
    viewBox='0 0 640 640'
    width={16}
    height={16}
    fill='currentColor'
  >
    <path d='M112 64L112 166.1L139.1 139C239.1 39 401.2 39 501.1 139C551.1 189 576.1 254.5 576.1 320C576.1 461.4 461.5 576 320.1 576C217.7 576 129.4 515.9 88.5 429.2L131.9 408.7C165.2 479.3 237 528 320.1 528C435 528 528.1 434.9 528.1 320C528.1 266.7 507.8 213.5 467.2 172.9C386 91.7 254.3 91.7 173 172.9L145.9 200L248.1 200L248.1 248L64 248L64 64L112 64z' />
  </svg>
)
