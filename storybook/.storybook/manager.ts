import { addons } from 'storybook/manager-api'

import theme from './theme'

addons.setConfig({
  theme,
  initialActive: 'canvas',
  // https://github.com/storybookjs/storybook/issues/7149#issuecomment-2096502983
  bottomPanelHeight: 0
})
