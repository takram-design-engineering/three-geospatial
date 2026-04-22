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

addons.register('focusIFrame', () => {
  addons.getChannel().on('currentStoryWasSet', () => {
    const iframe = document.querySelector('#storybook-preview-iframe')
    if (iframe != null) {
      ;(iframe as HTMLIFrameElement).focus()
    }
  })
})
