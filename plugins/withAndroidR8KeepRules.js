/**
 * Regras de keep do R8 para o build Android de release (o template do SDK 58 liga
 * `android.enableMinifyInReleaseBuilds=true`).
 *
 * Por quê: o expo-background-task usa WorkManager 2.10.x, que traz o Room 2.6.1. As regras do Room 2.6.x
 * (`-keep class * extends androidx.room.RoomDatabase`, sem membros) não preservam o construtor sem argumentos no
 * R8 full mode (padrão do AGP 8+). O R8 remove `WorkDatabase_Impl.<init>()` e o app FECHA na inicialização:
 *   java.lang.RuntimeException: Unable to get provider androidx.startup.InitializationProvider
 *   Caused by: java.lang.NoSuchMethodException: androidx.work.impl.WorkDatabase_Impl.<init> []
 *
 * Como ios/ e android/ são gerados (CNG, gitignored), as regras entram via config plugin no prebuild — local e no EAS.
 */
const fs = require('fs')
const path = require('path')
const { withDangerousMod } = require('expo/config-plugins')

const START = '# @generated begin embarquelivre-r8-keep-rules'
const END = '# @generated end embarquelivre-r8-keep-rules'

const RULES = [
  START,
  '# Room/WorkManager instanciam por reflexão (Class.getDeclaredConstructor()).',
  '-keep class * extends androidx.room.RoomDatabase { <init>(); }',
  '-keep class * extends androidx.work.InputMerger { <init>(); }',
  END,
].join('\n')

function applyRules(contents) {
  const pattern = new RegExp(`\\n?${START}[\\s\\S]*?${END}\\n?`, 'm')
  const base = contents.replace(pattern, '\n').trimEnd()
  return `${base}\n\n${RULES}\n`
}

const withAndroidR8KeepRules = (config) =>
  withDangerousMod(config, [
    'android',
    async (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro')
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
      fs.writeFileSync(file, applyRules(current))
      return cfg
    },
  ])

module.exports = withAndroidR8KeepRules
module.exports.applyRules = applyRules
