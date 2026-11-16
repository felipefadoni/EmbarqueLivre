/**
 * Remove o expo-dev-client do build de PRODUÇÃO (aplicado só quando APP_VARIANT=production; ver app.config.ts).
 *
 * Duas partes, porque nenhuma sozinha basta no SDK 58:
 * 1) Config plugins: o @expo/prebuild-config aplica o plugin do expo-dev-client como "legacy auto plugin" SEMPRE que
 *    o pacote está instalado — mesmo excluído do autolinking (bug aberto: https://github.com/expo/expo/issues/53147).
 *    Ele injeta NSLocalNetworkUsageDescription/NSBonjourServices, o scheme exp+<slug> e a config do launcher/menu.
 *    Como os três são `createRunOncePlugin`, registrá-los no histórico de plugins (History.addHistoryItem, o mesmo
 *    mecanismo do withRunOnce) faz o prebuild pulá-los.
 * 2) Autolinking: os módulos nativos (launcher, menu e dependências exclusivas) saem do Podfile e do settings.gradle
 *    via a opção oficial `exclude` do Expo Autolinking (use_expo_modules!(exclude:) / expoAutolinking.exclude).
 *    A exclusão em package.json (`expo.autolinking.exclude`) é estática e tiraria o dev-client do desenvolvimento.
 *
 * Doc: https://docs.expo.dev/modules/autolinking/#exclude e https://docs.expo.dev/build-reference/variants/
 */
const fs = require('fs')
const path = require('path')
const { History, withPodfile, withSettingsGradle } = require('expo/config-plugins')

const DEV_CLIENT_PLUGINS = ['expo-dev-client', 'expo-dev-launcher', 'expo-dev-menu']

/** Módulos nativos que só existem por causa do expo-dev-client (conferido no grafo de dependências do pnpm). */
const DEV_CLIENT_MODULES = ['expo-dev-client', 'expo-dev-launcher', 'expo-dev-menu', 'expo-dev-menu-interface']
/** Também usados pelo expo-updates: só excluir se o app NÃO tiver expo-updates. */
const SHARED_WITH_EXPO_UPDATES = ['expo-manifests', 'expo-json-utils', 'expo-updates-interface']

const MARKER = '@generated embarquelivre-without-dev-client'

function excludedModules(projectRoot) {
  let deps = {}
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
    deps = { ...pkg.dependencies, ...pkg.devDependencies }
  } catch {
    // sem package.json legível: exclui só o núcleo do dev-client
    return [...DEV_CLIENT_MODULES]
  }
  return deps['expo-updates'] ? [...DEV_CLIENT_MODULES] : [...DEV_CLIENT_MODULES, ...SHARED_WITH_EXPO_UPDATES]
}

/** Podfile: `use_expo_modules!` → `use_expo_modules!({ exclude: [...] })`. Falha alto se o template mudar. */
function excludeInPodfile(contents, modules) {
  if (contents.includes(MARKER)) return contents
  const pattern = /^(\s*)use_expo_modules!\s*$/m
  if (!pattern.test(contents)) {
    throw new Error('[withoutDevClient] `use_expo_modules!` não encontrado no Podfile: o build de produção levaria o expo-dev-client.')
  }
  const list = modules.map((m) => `'${m}'`).join(', ')
  return contents.replace(pattern, `$1# ${MARKER}\n$1use_expo_modules!({ exclude: [${list}] })`)
}

/** settings.gradle: define `expoAutolinking.exclude` antes de `expoAutolinking.useExpoModules()`. */
function excludeInSettingsGradle(contents, modules) {
  if (contents.includes(MARKER)) return contents
  const pattern = /^(\s*)expoAutolinking\.useExpoModules\(\)\s*$/m
  if (!pattern.test(contents)) {
    throw new Error('[withoutDevClient] `expoAutolinking.useExpoModules()` não encontrado no settings.gradle: o build de produção levaria o expo-dev-client.')
  }
  const list = modules.map((m) => `'${m}'`).join(', ')
  return contents.replace(pattern, `$1// ${MARKER}\n$1expoAutolinking.exclude = [${list}]\n$1expoAutolinking.useExpoModules()`)
}

const withoutDevClient = (config) => {
  for (const name of DEV_CLIENT_PLUGINS) {
    if (!History.getHistoryItem(config, name)) {
      config = History.addHistoryItem(config, { name, version: 'excluded-in-production' })
    }
  }
  config = withPodfile(config, (cfg) => {
    cfg.modResults.contents = excludeInPodfile(cfg.modResults.contents, excludedModules(cfg.modRequest.projectRoot))
    return cfg
  })
  config = withSettingsGradle(config, (cfg) => {
    cfg.modResults.contents = excludeInSettingsGradle(cfg.modResults.contents, excludedModules(cfg.modRequest.projectRoot))
    return cfg
  })
  return config
}

module.exports = withoutDevClient
module.exports.excludeInPodfile = excludeInPodfile
module.exports.excludeInSettingsGradle = excludeInSettingsGradle
module.exports.excludedModules = excludedModules
module.exports.DEV_CLIENT_PLUGINS = DEV_CLIENT_PLUGINS
