# Offline-first com PowerSync

O app lê e grava em um **SQLite local** (PowerSync + OP-SQLite). As telas de cadastros e de
lançamentos funcionam sem internet; o PowerSync baixa os dados do servidor e envia a fila de
alterações quando há conexão.

- SDK: `@powersync/react-native` **2.x** (linha atual; o OP-SQLite já vem embutido, não precisa de adaptador).
  Atenção: a tag `latest` do npm ainda aponta para a linha 1.x (quick-sqlite). Mantenha as versões fixadas no `package.json`.
- Docs: https://docs.powersync.com/client-sdks/reference/react-native-and-expo

## Rodar (development build — Expo Go NÃO funciona)

O PowerSync e o OP-SQLite têm código nativo. É preciso um development build (`expo-dev-client`).
No Expo Go (ou num dev build feito antes do op-sqlite) o app mostra a tela "Este app precisa de um
development build" em vez de quebrar com `Base module not found. Did you do a pod install/clear the gradle cache?`.

> `pnpm start` / `pnpm ios` (`expo start`) **não compilam nada nativo**: só servem o JS. Se o app
> "embarquelivre" não estiver instalado no simulador, o que abre é o Expo Go — e o banco local não existe lá.

### Passo a passo único (iOS simulador) — resolve o `Base module not found` e o `@babel/runtime`

```bash
# 0) API: para o token já trazer o IP da rede, no .env DA API (~/Work/Pessoal/embarquelivre-api/.env):
#      POWERSYNC_URL=http://192.168.1.77:8080
#    e reinicie: (cd ~/Work/Pessoal/embarquelivre-api && docker compose up -d api)
#    (opcional: o app já usa EXPO_PUBLIC_POWERSYNC_URL do .env do app, que tem precedência)
# 1) pare o `expo start` que estiver rodando (Ctrl+C) e feche o Expo Go no simulador
cd ~/Work/Pessoal/embarquelivre
pnpm install                                 # instala @babel/runtime (agora dependência direta) e o PowerSync
rm -rf node_modules/.cache/tamagui           # cache do compilador Tamagui com o resolve-failed antigo
npx expo prebuild --clean --platform ios     # recria ios/ (gitignored) e roda pod install (OPSQLite + powersync-sqlite-core)
(cd ios && pod install)                      # só se o passo anterior avisar que o pod install falhou (ou: pod install --repo-update)
npx expo run:ios                             # compila e instala o app "embarquelivre" no simulador (1ª vez: alguns minutos)
npx expo start --dev-client --clear          # próximas vezes; abra o app "embarquelivre", NÃO o Expo Go
```

### iOS (simulador) — passo a passo

```bash
cd ~/Work/Pessoal/embarquelivre
# 0) pare o `expo start` que estiver rodando (Ctrl+C) e feche o Expo Go no simulador
pnpm install
cp -n .env.example .env                 # se ainda não existir
npx expo prebuild --clean --platform ios   # gera ios/ (no .gitignore) e roda pod install
#   se o pod install falhar: (cd ios && pod install --repo-update)
npx expo run:ios                         # compila, instala e abre o app "embarquelivre" (1ª vez: alguns minutos)
#   escolher simulador: npx expo run:ios --device "iPhone 17 Pro"
```

Nas próximas vezes (sem mudar dependências nativas) basta:

```bash
npx expo start --dev-client --clear      # aperte "i" ou abra o app "embarquelivre" no simulador
```

Abra o app **embarquelivre** (ícone do projeto), **não o Expo Go**. Sempre que instalar/atualizar um pacote
nativo, rode de novo `npx expo prebuild --clean --platform ios && npx expo run:ios`.

### Android (emulador) — passo a passo

```bash
cd ~/Work/Pessoal/embarquelivre
# no .env: o IP do Mac (http://192.168.1.77:3000 / :8080) funciona; ou 10.0.2.2 no lugar de localhost
npx expo prebuild --clean --platform android
npx expo run:android                     # compila, instala e abre "embarquelivre" no emulador
# depois: npx expo start --dev-client --clear  (aperte "a")
# se o Gradle reclamar de cache: (cd android && ./gradlew clean) e rode run:android de novo
```

### EAS (nuvem), alternativa

```bash
npx eas-cli@latest build --profile development --platform ios        # simulador iOS
npx eas-cli@latest build --profile development-device --platform ios # aparelho
npx eas-cli@latest build --profile development --platform android    # APK
npx expo start --dev-client
```

Observações:
- `app.json` tem `ios.bundleIdentifier` / `android.package` = `com.fadoni.embarquelivre` (gravados pelo prebuild);
  assim o `expo start --dev-client` (tecla `i`/`a`) acha sempre o dev build certo. `ios/` e `android/` estão no `.gitignore`.
- Não precisa de config plugin para `@op-engineering/op-sqlite` nem para `@powersync/react-native`
  (autolinking); não use `use_frameworks!`; deployment target padrão do Expo SDK 58 serve.
- `@journeyapps/react-native-quick-sqlite` **não** é usado (era o adaptador da linha 1.x).
- Web não é suportado por este SDK (o app é mobile).

## Variáveis (.env)

| Variável | Padrão | Uso |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | `http://localhost:3000` | API (login, token e upload); o app acrescenta `/api/v1` |
| `EXPO_PUBLIC_POWERSYNC_URL` | — | Serviço PowerSync. **Se definida, vence** o `powersyncUrl` do token; vazia = usa o do token |
| `EXPO_PUBLIC_POWERSYNC_TOKEN_PATH` | `/powersync/token` | relativo a `/api/v1` |
| `EXPO_PUBLIC_POWERSYNC_UPLOAD_PATH` | `/powersync/upload` | relativo a `/api/v1` |
| `EXPO_PUBLIC_POWERSYNC_CHECKPOINT_MODE` | `legacy` | `requests` exige PowerSync Service ≥ 1.24 (o compose usa 1.28.1; o `.env` usa `requests`) |

### localhost × IP da rede

| Onde roda o app | API | PowerSync |
| --- | --- | --- |
| iOS Simulator (no Mac) | `http://localhost:3000` **ou** `http://192.168.1.77:3000` | `http://localhost:8080` ou `http://192.168.1.77:8080` |
| Emulador Android | `http://10.0.2.2:3000` ou o IP do Mac | `http://10.0.2.2:8080` ou o IP do Mac |
| Aparelho físico (mesma rede) | **só** `http://192.168.1.77:3000` | **só** `http://192.168.1.77:8080` |

O `.env` do app (gitignored) usa o IP do Mac (`192.168.1.77`), que serve para todos. Precedência do endpoint
PowerSync: `EXPO_PUBLIC_POWERSYNC_URL` (se definida) → `powersyncUrl` do `GET /powersync/token`. O token só traz o IP
depois que a API tiver `POWERSYNC_URL=http://192.168.1.77:8080` no `.env` dela (padrão `http://localhost:8080`, que
não funciona no aparelho físico); por isso a variável do app vence enquanto estiver definida.

## Arquitetura (`src/sync/`)

| Arquivo | Papel |
| --- | --- |
| `mapping.ts` | **Fonte única** de tabelas/colunas (campo do app ↔ coluna snake_case), tipos, índices, tabela local de pendências, normalização de timestamptz |
| `schema.ts` | Schema PowerSync gerado a partir do `mapping.ts` |
| `native.ts` | Detecta Expo Go / web / módulo OP-SQLite ausente antes de carregar o SDK |
| `database.ts` | Instância única do `PowerSyncDatabase` (`embarquelivre.db`), criada sob demanda: `@powersync/react-native` só é carregado via `require` depois da checagem |
| `connector.ts` | `fetchCredentials` (token) e `uploadData` (fila → API) |
| `upload.ts` | Regras puras do upload (lotes de 500, recusas, retry) |
| `lifecycle.ts` | Conectar / limpar por usuário (usado pelo `AuthProvider`) |
| `queries.ts` | SQL das listas e detalhes (joins, filtros, carência, paginação local) |
| `withdrawal.ts` | Cálculo de carência (puro) |
| `repository.ts` | Escritas locais + validações equivalentes aos 409 do servidor |
| `rejections.ts` / `editor.ts` | Pendências (recusas) e "Corrigir" nos formulários |
| `hooks.ts` | `useLocalList`, `useSyncInfo`, `useWaitForSync`, `useIsOnline` |
| `SyncProvider.tsx` | `PowerSyncContext` no layout raiz |

### Mapeamento de tabelas

| Entidade (app) | Tabela | Colunas (além de `id`) |
| --- | --- | --- |
| Fazenda | `farms` | `owner_user_id, name, city, state, created_at, updated_at` |
| Vacina | `vaccines` | `name, withdrawal_days (integer), created_at, updated_at` |
| Tipo de animal | `animal_types` | `name, created_at, updated_at` |
| Animal | `animals` | `farm_id, animal_type_id, code, sex, breed, birth_date, created_at, updated_at` |
| Lançamento | `animal_vaccinations` | `animal_id, farm_id, vaccine_id, applied_at, withdrawal_days (integer), withdrawal_until, created_by_user_id, created_at, updated_at` |
| Pendências (local) | `sync_rejections` | `entity, table_name, row_id, op, op_data, status_code (integer), error_code, message, field, created_at` — `localOnly`, nunca sobe |

**Não há tabela de usuários** no sync (o PowerSync publicaria a tabela inteira, com hash de senha). Nome do dono da
fazenda: online vem do REST `GET /farms/:id` → `ownerName`; offline aparece "Dono indisponível offline" (o próprio
master se reconhece pelo usuário logado).

Streams (todas `auto_subscribe`): `catalogs` (vacinas e tipos, todos), `account` (master/basic: fazendas da conta +
animais e lançamentos delas), `admin_all` (admin: tudo).

Datas: `YYYY-MM-DD` (texto). `timestamptz` chega como ISO UTC com microssegundos (`2026-11-10T15:17:43.051812Z`);
`normalizeTimestamp` troca espaço por `T` (se vier) e trunca a fração em 3 casas antes de `new Date` (Hermes). IDs: ULID **em maiúsculas** gerado no app (`ids.ts`, PRNG do `expo-crypto`).

## Autenticação e ciclo de vida

- `fetchCredentials`: `GET /api/v1/powersync/token` com o Bearer do app (o cliente `http` já faz o refresh single-flight).
  Resposta `{ token, powersyncUrl, expiresAt }` (RS256 com `kid`; claims `sub, role, masterId, iss, aud, iat, exp=iat+900`).
  503 `POWERSYNC_NOT_CONFIGURED` (API sem chave) → o SDK tenta de novo com backoff e loga o aviso. O token fica em cache e é renovado quando faltam < 2 min (TTL 15 min).
- Login / app aberto com sessão: `syncLifecycle.start(userId)` → `db.connect(connector)`. Se o usuário for **outro**
  que o da última sessão, faz `disconnectAndClear()` antes.
- Logout explícito (Menu → Sair): `disconnectAndClear({ clearLocal: true })`. Antes, o app conta **na hora** a fila de
  envio (`getUploadQueueStats`) + pendências em `sync_rejections`; se houver algo, pede confirmação. Cancelar = continua
  conectado, nada é apagado (`src/sync/logout.ts`).
- Sessão expirada (refresh recusado): só `disconnect()` — os dados e a fila ficam no aparelho; ao entrar de novo com o mesmo
  usuário, a fila é enviada. Se entrar outro usuário, o banco é limpo.
- Sem rede ao abrir o app: o `restore` usa o último usuário salvo (SecureStore) e o app abre com os dados locais.

## Escritas locais (o que o app valida antes de gravar)

- Mesmas validações de formulário de antes.
- Equivalentes locais dos 409, com as mesmas mensagens pt-BR: `FARM_HAS_ANIMALS`, `VACCINE_HAS_APPLICATIONS`,
  `ANIMAL_TYPE_HAS_ANIMALS`, `ANIMAL_HAS_VACCINATIONS`, `ANIMAL_CODE_ALREADY_EXISTS` (código único por fazenda,
  sem diferenciar maiúsculas) e nome duplicado de vacina/tipo — único sem diferenciar maiúsculas, ignorando o próprio
  registro na edição — com mensagem no campo Nome: `VACCINE_NAME_ALREADY_EXISTS` ("Já existe uma vacina com esse nome.") e
  `ANIMAL_TYPE_NAME_ALREADY_EXISTS` ("Já existe um tipo de animal com esse nome."). O servidor (upload e REST) responde
  409 `VACCINE_NAME_ALREADY_EXISTS` / `ANIMAL_TYPE_NAME_ALREADY_EXISTS` (um `CONFLICT` antigo também é mapeado); a
  pendência usa a mensagem pt-BR e, ao Corrigir, ela aparece no campo Nome.
- Lançamento: `applied_at` padrão hoje (não pode ser futuro nem antes de 1900); `withdrawal_days` copiado da vacina;
  `withdrawal_until = applied_at + dias`; `farm_id` do animal; `created_by_user_id` = usuário atual. Editar mantendo a
  mesma vacina mantém a cópia de dias; trocar a vacina recalcula com a carência atual dela.
- Fazenda: `owner_user_id` só no cadastro feito por **admin**; nunca em alteração (também removido no upload de PATCH).
- Carência calculada no SQLite: `totalWithdrawalDays` = soma de todas as aplicações (inclui vencidas),
  `freeAt` = maior `withdrawal_until`, `inWithdrawal` = hoje < `freeAt` (livre NO dia).

## Upload e Pendências

`uploadData` pega a próxima transação (`getNextCrudTransaction`) e envia
`POST /api/v1/powersync/upload` com `{ batch: [{ op, table, id, opData }] }` em lotes de até 500.

| Resposta | O que o app faz |
| --- | --- |
| 2xx com `results[]` | `applied` → ok; `rejected` → grava em `sync_rejections` com a mensagem pt-BR; op sem resultado → pendência `SYNC_NO_RESULT` |
| 2xx sem `results` | (o contrato diz que nunca acontece) lote inteiro considerado aplicado |
| 401 | o cliente `http` faz refresh e reenvia; se ainda falhar, **lança** (retry) |
| 408, 429, 5xx (ex.: 503 `SYNC_UNAVAILABLE`), sem rede | **lança** → o PowerSync tenta de novo depois (nada é concluído) |
| 400 `INVALID_BATCH` / `BATCH_TOO_LARGE` (ou outro 4xx no lote) | bug do app: `console.warn` e todas as ops do lote viram pendências (não re-tenta para sempre) |

`results` vem um por op, na ordem; o app casa por `id/table/op` e, se o tamanho bate, pela posição (op inválida pode vir
com `id: null`). `error.details.field` (coluna snake_case) é gravado em `sync_rejections.field`.
Mensagens pt-BR de todos os códigos do §19.8 da API estão em `src/api/errors.ts` (a mensagem pt-BR do servidor é usada quando vem).

Depois de gravar as recusas, a transação é concluída (`complete()`): **uma recusa não trava a fila**.

### Por que "Descartar" só apaga o aviso

Com `complete()`, a operação recusada sai da fila. No próximo checkpoint do servidor (fila vazia), o PowerSync
reaplica o estado do servidor por cima do SQLite local: um cadastro recusado some, uma alteração volta ao valor
anterior e uma exclusão recusada faz o registro reaparecer. Então "Descartar" = remover a linha de `sync_rejections`;
não é preciso desfazer nada à mão.

### "Corrigir"

Abre o formulário com os valores recusados (`op_data` → campos do app):
- cadastro recusado (PUT) → formulário **novo** preenchido (gera um novo ULID);
- alteração/exclusão recusada com o registro ainda no aparelho → formulário de **edição** preenchido;
- registro não existe mais localmente → formulário novo preenchido.

O erro aparece **no campo** apontado por `details.field` (convertido para o campo do app pelo `mapping.ts`) ou, sem ele,
pelo código (ex.: `ANIMAL_CODE_ALREADY_EXISTS` → Código, `INVALID_APPLIED_AT` → Data); senão, num aviso no topo.

Ao salvar, a pendência é removida e a nova operação entra na fila.

## Telas

- Menu → card **Sincronização** (online/offline/sincronizando, última sincronização, alterações aguardando envio)
  e **Pendências** (com contador). Indicador compacto também na aba Vacinas.
- Pull-to-refresh nas listas espera a sincronização (checkpoint em `requests`, ou fim de upload/download em `legacy`),
  com limite de 15 s; offline volta na hora.
- Login, cadastro de conta e escolha do master dono (admin) continuam online, com aviso quando não há internet.

## Contrato do backend (API_INTEGRATION.md §19)

- Streams: `catalogs` (todos), `account` (master/basic), `admin_all` (admin). Vacinas e tipos são globais.
- Token: `sub` = id do usuário; o servidor deriva o master nas sync rules.
- Upload idempotente: o mesmo lote pode ser reenviado após 5xx/timeout (PUT = upsert pelo `id`; DELETE de registro
  inexistente = aplicado).
- Colunas derivadas que o app envia mas o servidor deve **ignorar/recalcular**: `animal_vaccinations.farm_id`,
  `withdrawal_until`, `created_by_user_id`; e `created_at`/`updated_at` de todas as tabelas.

## Testar no aparelho

- Modo avião: cadastrar animal e lançar vacina; voltar a rede e ver a fila zerar.
- Mesmo código de animal criado em dois aparelhos offline → um vira pendência ("Já existe um animal com este código nesta fazenda.").
- Excluir no aparelho A uma vacina que ganhou lançamento no aparelho B → pendência de exclusão.
- Logout com pendências (aviso) e troca de usuário (banco limpo).
- Token expirando durante uso longo (15 min).
