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
| `shipmentEligibility.ts` | Análise de embarque (livres / em carência / em outro embarque no dia), reaproveitando `withdrawal.ts` |
| `repository.ts` | Escritas locais + validações equivalentes aos 409 do servidor |
| `rejections.ts` / `editor.ts` | Pendências (recusas) e "Corrigir" nos formulários |
| `hooks.ts` | `useLocalList`, `useSyncInfo`, `useWaitForSync`, `useIsOnline` |
| `SyncProvider.tsx` | `PowerSyncContext` no layout raiz |

### Mapeamento de tabelas

| Entidade (app) | Tabela | Colunas (além de `id`) |
| --- | --- | --- |
| Fazenda | `farms` | `account_id, owner_user_id` (alias deprecado), `name, city, state, created_at, updated_at` |
| Vacina | `vaccines` | `name, withdrawal_days (integer), created_at, updated_at` |
| Tipo de animal | `animal_types` | `name, created_at, updated_at` |
| Animal | `animals` | `farm_id, animal_type_id, code, sex, breed, birth_date, herd_id` (nullable), `shipped_at` (só leitura: embarcado em embarque finalizado; nunca sobe), `created_at, updated_at` |
| Rebanho | `herds` | `farm_id, name, description, formed_at` (YYYY-MM-DD), `created_at, updated_at` — nomes em `HERDS_CONTRACT` (§17.10) |
| Embarque | `shipments` | `farm_id, name, shipped_on` (YYYY-MM-DD), `status` (`in_progress`/`finished`), `finished_at` (só leitura, nunca sobe), `created_by_user_id` (calculado pelo servidor, ignorado no upload), `created_at, updated_at` — `SHIPMENTS_CONTRACT` + `SHIPMENT_FLOW_CONTRACT` (contrato final) |
| Animal no embarque | `shipment_animals` | `shipment_id, animal_id, weight_kg` (real), `photo_id`, `photo_content_type`/`photo_size_bytes` (só leitura, nunca sobem), `created_at, updated_at` — uma linha por animal |
| Fila de fotos (local) | `shipment_photo_queue` | `id` (= `photo_id`), `shipment_id, animal_id, link_id, local_uri, status` (`pending`/`uploaded`/`failed`), `attempts, last_error, created_at, updated_at` — `localOnly`, nunca sobe |
| Lançamento | `animal_vaccinations` | `animal_id, farm_id, vaccine_id, applied_at, withdrawal_days (integer), withdrawal_until, created_by_user_id, created_at, updated_at` |
| Pendências (local) | `sync_rejections` | `entity, table_name, row_id, op, op_data, status_code (integer), error_code, message, field, created_at` — `localOnly`, nunca sobe |

**Não há tabela de usuários** no sync (o PowerSync publicaria a tabela inteira, com hash de senha). Nome do dono da
fazenda: online vem do REST `GET /farms/:id` → `ownerName`; offline aparece "Dono indisponível offline" (o próprio
master se reconhece pelo usuário logado).

Streams (todas `auto_subscribe`): `catalogs` (vacinas e tipos, todos), `account` (master/basic: fazendas da conta +
animais, rebanhos e lançamentos delas), `admin_all` (admin: tudo).
Rebanhos (`herds` + `animals.herd_id`) seguem o contrato final (`src/api/herdsContract.ts`, §17.10 e §19): streams
`account` e `admin_all`. `formed_at` é a data de formação (hoje = America/Sao_Paulo). Excluir rebanho desvincula os
animais. Um PUT de animal sem `herd_id` desvincula — o app sempre grava a coluna.
No cadastro de um rebanho novo, o insert em `herds` e os updates de `herd_id`/`updated_at` nos animais escolhidos
correm na mesma `writeTransaction` do PowerSync: um único lote na fila, rebanho primeiro, depois os animais
(funciona offline).

Embarques (`shipments` + `shipment_animals`) seguem `src/api/shipmentsContract.ts` (`SHIPMENTS_CONTRACT` +
`SHIPMENT_FLOW_CONTRACT`, contrato final da API, §17.11 e §19 de `API_INTEGRATION.md`). Streams `account` (master/basic)
e `admin_all` (admin). Aba própria **Embarques** (abas Em andamento / Finalizado).

- Criar: sempre `in_progress`, sem animais (`animalIds` não existe mais em POST/PUT/PATCH). A fazenda é imutável;
  `shipped_on` vai de 1900-01-01 a hoje + 2 anos (America/Sao_Paulo).
- Animais entram **um a um**, cada um com **peso** (kg, 1–2000, no máximo 1 casa decimal) e **foto** (câmera; galeria se
  a câmera for negada), comprimida no aparelho (lado maior 1280 px, JPEG 0,7; o servidor aceita JPEG/PNG/WEBP até 10 MB,
  413 acima). `addShipmentAnimal` grava na mesma `writeTransaction` o vínculo (`weight_kg` + `photo_id` gerado no app)
  e a linha da fila local `shipment_photo_queue` (id = `photo_id`). Trocar a foto gera outro `photo_id`. Um animal só pode
  estar em um embarque (409 `ANIMAL_ALREADY_IN_SHIPMENT`, mesmo no mesmo embarque).
- **Ordem obrigatória de upload** (`uploadOrder: photo → link → finish`): o PUT do embarque vem numa transação anterior;
  antes de enviar um lote que tenha PUT/PATCH de `shipment_animals` com `photo_id`, o connector chama
  `ensurePhotosUploaded` (`src/sync/photoQueue.ts`), que faz `POST /shipments/:id/photos` (multipart `photo` + `id`,
  idempotente) de cada foto ainda `pending`; só depois o lote do vínculo sobe. Finalizar é um PATCH posterior. O binário
  nunca vai no upload do PowerSync. Falha temporária da foto (sem rede, 408, 429, 5xx) → lança e o PowerSync tenta de
  novo (a fila não anda); 401 → sessão encerrada; outros 4xx (ex.: 413, `INVALID_SHIPMENT_PHOTO`) → foto `failed` com a
  mensagem do servidor e o lote segue (o servidor recusa o vínculo com `SHIPMENT_ANIMAL_PHOTO_REQUIRED` → Pendência;
  "Reenviar foto" na tela). Foto enviada mas nunca vinculada fica no servidor até o embarque ser excluído.
- Finalizar (`finishShipment`, basic/master/admin): PATCH `{ status: "finished" }`. Vazio → 422 `SHIPMENT_EMPTY`.
  Vínculos antigos sem peso/foto não impedem; peso + foto só são exigidos em vínculo novo. Localmente grava
  `finished_at` e `animals.shipped_at` (somem da lista na hora, offline); essas colunas são do servidor e são
  removidas do upload (`NEVER_UPLOAD_COLUMNS`; PATCH que fica vazio é descartado). Finalizado = só leitura (422
  `SHIPMENT_FINISHED`; reenviar os mesmos valores é aceito pelo servidor).
- **Flag oficial `animals.shipped_at`**: `shipped_at IS NOT NULL` some de Animais cadastrados, seletores, modal de
  adicionar e dashboard (`animalShippedExpr`). Vincular embarcado → 409 `ANIMAL_ALREADY_SHIPPED`.
- Carência **não bloqueia** (não existe mais `SHIPMENT_ANIMAL_IN_WITHDRAWAL`): ao adicionar um animal em carência no dia
  do embarque o app avisa e pede confirmação (checkbox); ao mudar a data para um dia com animais em carência, aviso e
  diálogo "Salvar mesmo assim". O repositório não valida carência.
- Excluir embarque: só master/admin (basic → `INSUFFICIENT_ROLE`; no upload, 200 + `rejected` = definitivo). Em
  andamento: desvincula os animais. Finalizado: os animais continuam embarcados (`shipped_at` fica). Vínculos, fotos da
  fila e o embarque saem na mesma transação. Basic pode remover vínculos.
- Animal: trocar de fazenda tira do embarque em andamento na mesma transação; se o embarque estiver finalizado → 422
  `SHIPMENT_FINISHED` (não desvincula). Excluir animal embarcado **não** é bloqueado e o tira até do embarque finalizado
  (CASCADE no servidor; o app apaga o vínculo na mesma transação).

Datas: `YYYY-MM-DD` (texto). `timestamptz` chega como ISO UTC com microssegundos (`2026-11-10T15:17:43.051812Z`);
`normalizeTimestamp` troca espaço por `T` (se vier) e trunca a fração em 3 casas antes de `new Date` (Hermes). IDs: ULID **em maiúsculas** gerado no app (`ids.ts`, PRNG do `expo-crypto`).

## Autenticação e ciclo de vida

- `fetchCredentials`: `GET /api/v1/powersync/token` com o Bearer do app (o cliente `http` já faz o refresh single-flight).
  Resposta `{ token, powersyncUrl, expiresAt }` (RS256 com `kid`; claims `sub, role, masterId, iss, aud, iat, exp=iat+900`).
  503 `POWERSYNC_NOT_CONFIGURED` (API sem chave) → o SDK tenta de novo com backoff e loga o aviso. O token fica em cache e é renovado quando falta < 1 min (TTL 5 min / 300 s).
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
  `ANIMAL_TYPE_NAME_ALREADY_EXISTS` ("Já existe um tipo de animal com esse nome.") e, no rebanho,
  `HERD_NAME_ALREADY_EXISTS` (nome único por fazenda, 2–120, sem diferenciar maiúsculas) e `HERD_FARM_MISMATCH` (animal e
  rebanho da mesma fazenda). Excluir rebanho desvincula os animais (`herd_id = null`). Excluir fazenda com rebanhos:
  `FARM_HAS_HERDS` (se também houver animais, `FARM_HAS_ANIMALS` vem antes). O servidor (upload e REST) responde
  409 `VACCINE_NAME_ALREADY_EXISTS` / `ANIMAL_TYPE_NAME_ALREADY_EXISTS` (um `CONFLICT` antigo também é mapeado); a
  pendência usa a mensagem pt-BR e, ao Corrigir, ela aparece no campo Nome.
- Lançamento: `applied_at` padrão hoje (não pode ser futuro nem antes de 1900); `withdrawal_days` copiado da vacina;
  `withdrawal_until = applied_at + dias`; `farm_id` do animal; `created_by_user_id` = usuário atual. Editar mantendo a
  mesma vacina mantém a cópia de dias; trocar a vacina recalcula com a carência atual dela.
- Fazenda: `account_id` só no cadastro feito por **admin** (`owner_user_id` é alias deprecado); nunca em alteração (também removido no upload de PATCH). Master/basic não enviam: o servidor atribui à conta de quem cria.
- Embarque (todas as regras abaixo também valem para o basic, exceto excluir): nome 2–120, único por fazenda sem
  diferenciar maiúsculas (`SHIPMENT_NAME_ALREADY_EXISTS`), `INVALID_SHIPPED_ON`, `SHIPMENT_FARM_IMMUTABLE`, embarque
  finalizado (`SHIPMENT_FINISHED`). Animal novo, nesta ordem: `ANIMAL_NOT_FOUND` → `SHIPMENT_ANIMAL_FARM_MISMATCH` →
  `ANIMAL_ALREADY_SHIPPED` → `ANIMAL_ALREADY_IN_SHIPMENT` (`details.conflicts`) → `INVALID_SHIPMENT_ANIMAL_WEIGHT`
  (`weightKg`) → `SHIPMENT_ANIMAL_PHOTO_REQUIRED` (`photo`). Finalizar vazio: `SHIPMENT_EMPTY`. No upload os
  `details.field` vêm em snake_case (`animal_id`, `shipment_id`, `shipped_on`, `farm_id`, `weight_kg`, `photo_id`);
  Pendências leva os de vínculo para a seção de animais do embarque. Outros códigos do servidor (mensagem do servidor tem
  prioridade): `INVALID_SHIPMENT_PHOTO`, `SHIPMENT_PHOTO_NOT_FOUND`, `SHIPMENT_PHOTO_IN_USE`, `INVALID_SHIPMENT_STATUS`
  (filtro `status` da lista REST aceita só `in_progress|finished`), 413 (foto grande). A carência no dia do embarque (só
  aviso) usa a regra do app (`isActiveOn` com o dia do embarque no lugar de "hoje"), considerando só as aplicações com
  `applied_at <= shipped_on`; livre no próprio dia `freeAt`. Excluir fazenda com embarques: `FARM_HAS_SHIPMENTS`
  (depois de `FARM_HAS_ANIMALS` e `FARM_HAS_HERDS`).
- Carência calculada no SQLite: `totalWithdrawalDays` = soma de todas as aplicações (inclui vencidas),
  `freeAt` = maior `withdrawal_until`, `inWithdrawal` = hoje < `freeAt` (livre NO dia).

## Upload e Pendências

`uploadData` pega a próxima transação (`getNextCrudTransaction`) e envia
`POST /api/v1/powersync/upload` com `{ batch: [{ op, table, id, opData }] }` em lotes de até 500.

| Resposta | O que o app faz |
| --- | --- |
| 2xx com `results[]` | `applied` → ok; `rejected` → grava em `sync_rejections` com a mensagem pt-BR; op sem resultado → pendência `SYNC_NO_RESULT` |
| 2xx sem `results` | (o contrato diz que nunca acontece) lote inteiro considerado aplicado |
| 401 UNAUTHENTICATED | o cliente `http` tenta refresh; se o usuário foi removido/inativo (ou o refresh falhar), a sessão é encerrada **sem retry**, mantendo os dados locais |
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

### Rebanho recusado e vínculos de animais (grupo)

Se o servidor recusa o cadastro do rebanho (ex.: `HERD_NAME_ALREADY_EXISTS`), os updates de `herd_id` dos animais
desse mesmo lote também são recusados em seguida (`HERD_NOT_FOUND`, `HERD_FARM_MISMATCH` ou similar). Tudo continua
em `sync_rejections` (local-only), uma linha por operação.

Na tela de Pendências, `groupRejections` junta essas recusas: o item **principal** é o do rebanho (erro real, campo
Nome para corrigir). Os vínculos aparecem como dependentes, com o texto pt-BR "N animais aguardam este rebanho",
e **não** como N cartões soltos. O critério é o `herd_id`/`herdId` no `op_data` do animal ser o `row_id` de uma
recusa de `herds` ainda aberta. Recusa de animal sem um rebanho recusado correspondente segue avulsa.

- **Descartar** o rebanho apaga também os avisos dos vínculos (`discardRejectionGroup`). Como as ops já saíram da
  fila no `complete()`, o próximo checkpoint devolve rebanho e animais ao estado do servidor.
- **Corrigir** abre o cadastro novo (PUT recusado gera outro ULID) já com os animais dependentes na seleção. Ao
  salvar, a mesma `writeTransaction` recria o rebanho e reaplica os vínculos; `clearPendencia` descarta o grupo
  inteiro (rebanho + dependentes).

### Embarque recusado e vínculos de animais (grupo)

Mesmo esquema do rebanho: se o servidor recusa o cadastro do embarque, as recusas de `shipment_animals` cujo
`op_data.shipment_id` é o `row_id` desse embarque aparecem como dependentes ("N animais aguardam este embarque").
Descartar apaga o grupo; Corrigir abre "Novo embarque" preenchido; os animais precisam ser adicionados de novo, com
foto e peso. "Corrigir" de um vínculo avulso abre o embarque dele (`/embarques/[id]`).
Um 403 `INSUFFICIENT_ROLE` (ex.: exclusão feita por basic) volta como op `rejected`: vira pendência definitiva, sem retry,
com a mensagem oficial.

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
  `withdrawal_until`, `created_by_user_id`; e `created_at`/`updated_at` de todas as tabelas. Nunca sobem (removidas
  antes do upload): `shipments.finished_at`, `animals.shipped_at`, `shipment_animals.photo_content_type` e
  `photo_size_bytes`.

## Testar no aparelho

- Embarques (modo avião; precisa de build nativo novo por causa da câmera): criar embarque, adicionar animais com foto
  e peso (um em carência pede confirmação), finalizar; os animais somem de Animais cadastrados na hora. Voltar a rede:
  as fotos sobem antes dos vínculos e a fila zera. Basic finaliza, mas não vê "Excluir embarque".

- Modo avião: cadastrar animal e lançar vacina; voltar a rede e ver a fila zerar.
- Mesmo código de animal criado em dois aparelhos offline → um vira pendência ("Já existe um animal com este código nesta fazenda.").
- Excluir no aparelho A uma vacina que ganhou lançamento no aparelho B → pendência de exclusão.
- Logout com pendências (aviso) e troca de usuário (banco limpo).
- Token PowerSync expirando durante uso longo (TTL 5 min; renovado 1 min antes).
