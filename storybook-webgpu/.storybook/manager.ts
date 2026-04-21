/* cspell:words customisations */

import { addons, type State } from 'storybook/manager-api'

import { main } from './theme'

addons.setConfig({
  theme: main,
  initialActive: 'canvas',
  panelPosition: 'right',
  layoutCustomisations: {
    showPanel(state: State, defaultValue: boolean) {
      return defaultValue
    }
  }
})
