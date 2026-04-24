/* cSpell:words: customisations */

import { addons, type State } from 'storybook/manager-api'

import theme from './theme'

addons.setConfig({
  theme,
  initialActive: 'canvas',
  layoutCustomisations: {
    showPanel: (state: State, defaultValue: boolean) => {
      return false
    }
  }
})
