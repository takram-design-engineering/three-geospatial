import { addons } from '@storybook/manager-api'

addons.setConfig({
  initialActive: 'canvas',
  // https://github.com/storybookjs/storybook/issues/7149#issuecomment-2096502983
  bottomPanelHeight: 0
})
