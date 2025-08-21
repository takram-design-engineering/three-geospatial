import { addons } from 'storybook/manager-api'

import { main } from './theme'

addons.setConfig({
  theme: main,
  initialActive: 'canvas',
  panelPosition: 'right'
})
