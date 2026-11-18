/**
 * A Play Console recusa o envio quando o manifesto exige recursos que nem todo aparelho tem.
 * O retrato vem de `orientation: portrait` e o Wi-Fi é injetado por biblioteca nativa; nenhum dos dois é essencial
 * (o app sincroniza em qualquer rede e só prefere abrir em pé). Marcá-los como opcionais amplia a disponibilidade
 * sem mudar o comportamento.
 *
 * android/ é gerado no prebuild (CNG), então a declaração entra aqui e vale no build local e no EAS.
 */
const { withAndroidManifest } = require('expo/config-plugins')

const OPTIONAL = ['android.hardware.wifi', 'android.hardware.screen.portrait']

function markOptional(androidManifest) {
  const manifest = androidManifest.manifest
  const features = manifest['uses-feature'] ?? []
  for (const name of OPTIONAL) {
    const existing = features.find((feature) => feature.$['android:name'] === name)
    if (existing) {
      existing.$['android:required'] = 'false'
    } else {
      features.push({ $: { 'android:name': name, 'android:required': 'false' } })
    }
  }
  manifest['uses-feature'] = features
  return androidManifest
}

const withOptionalAndroidFeatures = (config) =>
  withAndroidManifest(config, (cfg) => {
    cfg.modResults = markOptional(cfg.modResults)
    return cfg
  })

module.exports = withOptionalAndroidFeatures
module.exports.markOptional = markOptional
