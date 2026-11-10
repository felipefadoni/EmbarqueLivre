const { getDefaultConfig } = require('expo/metro-config')
const { withTamagui } = require('@tamagui/cli/metro')

const config = getDefaultConfig(__dirname)

module.exports = withTamagui(config, {
  components: ['tamagui'],
  config: './tamagui.config.ts',
})
