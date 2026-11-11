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
| 2xx com `results[]` | `applied` → ok; `rejected` com 4xx definitivo → grava em `sync_rejections` (Pendência) com a mensagem pt-BR; `rejected` com 408/429/5xx ou op sem resultado → **fila** (lança, nada concluído); `rejected` 401 → sessão encerrada |
| 2xx com JSON sem `results` | (o contrato diz que nunca acontece) lote inteiro considerado aplicado |
| 2xx sem JSON (portal cativo do Wi‑Fi, proxy com HTML) | **fila** (nada foi confirmado) |
| 401 UNAUTHENTICATED | o cliente `http` tenta refresh; se o usuário foi removido/inativo (ou o refresh falhar), a sessão é encerrada **sem retry**, mantendo os dados locais |
| 408, 429, 5xx (ex.: 503 `SYNC_UNAVAILABLE`), sem rede | **lança** → o PowerSync tenta de novo depois (nada é concluído) |
| 4xx no lote inteiro (404/405 de rota ou proxy, 403 de firewall, 413, 400 `INVALID_BATCH`) | **fila** (`BatchBlockedUploadError`): não é culpa do cadastro, nada vira Pendência; `console.warn` com status/código e o indicador mostra o que conferir (ex.: endereço da API) |

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

## Sync automático e em segundo plano

O app nunca fala com o RUSTFS: fotos e dados sobem só pelas rotas autenticadas da API
(contrato de fotos inalterado). Vale para **qualquer rede** — Wi‑Fi ou dados móveis
(3G/4G/5G); não há restrição a Wi‑Fi (`isOnline` em `src/sync/syncTriggers.ts` ignora o tipo).

**Gatilhos** (`useSyncTriggers`, montado em `src/app/(app)/_layout.tsx`):

- **Rede voltou** (NetInfo offline → online) e **app voltou ao primeiro plano**: se o PowerSync
  estiver desconectado, reconecta na hora (`syncLifecycle.reconnect()`), sem esperar o retry interno.
  Debounce de 1,5 s e no máximo uma reconexão forçada a cada 10 s — sem loop. Já conectado: nada a
  fazer, o SDK envia a fila sozinho.
- **Abertura do app**: retoma tudo que ficou pendente (fila CRUD + `shipment_photo_queue`).
- **Segundo plano** (`src/sync/backgroundSync.ts`, `expo-background-task`): tarefa periódica
  `embarquelivre-background-sync` (mínimo 15 min, **o SO decide quando**) que esvazia a fila de
  upload em até ~25 s (`drainUploadQueue`). Registrada após o login; removida no logout explícito.
  A tarefa é definida em `index.ts` (entrada do app, antes do `expo-router/entry`) para existir
  mesmo quando o SO acorda o app sem UI.
- **Fotos no iOS** sobem em `URLSession` de segundo plano (`sessionType: 'background'`): um upload
  já iniciado continua com o app suspenso.

**Ordem garantida** (a mesma do primeiro plano — o `uploadData` do connector é serializado, então
SDK e tarefa de fundo nunca enviam em paralelo):

1. `POST` da foto (o embarque já existe no servidor — `ensurePhotos` antes do vínculo);
2. `PUT` do vínculo com `photo_id` + `weight_kg`;
3. `finish` do embarque (transação posterior na fila).

**Retry e backoff**: falha de rede/408/429/5xx deixa pendente; o SDK tenta de novo a cada 15 s
(`retryDelayMs`, antes 5 s) enquanto o app está aberto; a tarefa de fundo para na primeira falha
temporária e espera a próxima janela do SO. Recusa definitiva (outro 4xx) **não** é reenviada: vai
para Pendências/foto "não aceita" e o lote segue. 401 encerra a sessão (em segundo plano, sem UI,
a tarefa só para; a próxima abertura trata o login).

O indicador de sync mostra "N foto(s) aguardando envio" e avisa que envia sozinho quando a rede
voltar.

### Envio direto para a API e falhas visíveis

O SDK do PowerSync só envia a fila enquanto o **stream de download** (serviço PowerSync, porta 8080) está de pé:
depois de uma falha com o stream desconectado ele sai do laço de envio e só volta com uma nova escrita local ou com
o stream conectado; no modo `requests` ainda espera o checkpoint do serviço depois de esvaziar a fila. Com o serviço
PowerSync fora (VPS com `wal_level` errado, URL/IP errado, serviço parado) e a API no ar, a fila ficava parada — e a
tela não dizia nada (o `uploadError` do SDK não era exibido).

- `src/sync/uploadPump.ts` (puro) + `useUploadPump.ts`: com o SDK **desconectado**, rede e fila não vazia, envia a fila
  direto para `POST /api/v1/powersync/upload` pelo mesmo `connector.uploadData` (um por vez, mesma ordem e regras).
  Verifica a cada 15 s com o app aberto e logo que a rede volta / o app abre; após falha temporária espera
  15 s → 30 s → 1 min → 2 min → 5 min. Conectado, quem envia é o SDK.
- Indicador de sync (Configurações e Pendências): "N alterações aguardando envio", o motivo da falha em vermelho
  (ex.: "Envio falhou: Não foi possível falar com o servidor (192.168.1.77:3000)…", "HTTP 503", "Sua sessão expirou")
  e o botão **Enviar agora**, que tenta na hora e mostra um alerta com o resultado.
- **Pendências ≠ fila.** Pendências lista só o que o servidor **recusou** (`sync_rejections`, não reenviado
  sozinho: "Corrigir" grava de novo, "Descartar" volta ao estado do servidor). O que ainda não subiu é a fila
  (`ps_crud`) e aparece como "aguardando envio" no indicador.
- "Reenviar foto": envia a foto na hora (ou a fila, se o vínculo ainda estiver nela) e mostra o resultado.
- Upload de foto tem teto de 2 min (vira "pendente"), para não segurar a fila inteira sem aviso.

### Pendência é só recusa do dado (offline-first)

Regra do Felipe: cadastro feito sem sinal é dado normal do app e sobe **sozinho** quando houver internet; ninguém precisa
abrir tela nem tocar em nada. Por isso:

- **Pendências** lista só o que a API recusou para aquela operação por causa do dado. **Corrigir** aparece só em
  400/409/422 (validação, nome duplicado, regra); outras recusas definitivas (ex.: 403 de permissão, 404 de registro
  que não existe mais) mostram só **Descartar**, com a explicação.
- Falha de envio (sem rede, timeout, 401, 408/429/5xx, lote inteiro recusado por rota/proxy, 2xx sem JSON, op sem
  resultado) **nunca** vira Pendência: fica na fila e o SDK/envio direto reenvia (status só no indicador).
- **Saída de reenvio** (`sync_outbox`, local): versões anteriores gravavam essas falhas como Pendência e tiravam a op do
  `ps_crud`. Ao abrir o app (e antes de cada envio), `requeueDeliveryFailures` devolve essas "recusas" para o envio
  automático — e junto as recusas `*_NOT_FOUND` que só aconteceram porque o "pai" (ex.: a fazenda do animal) não tinha
  chegado. O connector envia a saída **antes** da fila, na ordem original; se a API recusar de verdade (ex.: 422),
  vira Pendência normal. Enquanto isso, conta como "aguardando envio" no indicador e na confirmação do "Sair".

### Limites reais (iOS e Android)

- **Envio imediato não é garantido.** Nenhum dos dois SOs acorda o app quando a rede volta; com o
  app em segundo plano o envio acontece na próxima janela do SO (≥ 15 min, pode levar horas: bateria,
  modo economia, uso do app) ou quando o usuário abrir o app.
- **iOS — app encerrado no multitarefa (swipe up)**: o iOS cancela as tarefas de fundo e os uploads
  em `URLSession` de fundo até o usuário abrir o app de novo. Em segundo plano normal (só minimizado)
  funcionam. `BGTaskScheduler` não roda no simulador de forma confiável — teste no aparelho.
- **Android — "Forçar parada"** nas configurações cancela o WorkManager até a próxima abertura;
  Doze/economia de bateria atrasa as execuções. Fechar pelo multitarefa normalmente mantém o agendamento
  (varia por fabricante — Xiaomi/Samsung/Huawei podem matar).
- **Aparelho bloqueado desde o boot (iOS)**: o Keychain com a sessão fica ilegível até o primeiro
  desbloqueio; a tarefa pula essa janela.
- **Download** (dados novos do servidor) só com o app aberto; em segundo plano só sobe a fila.
- **Requer build nativo novo** (`npx expo prebuild --platform ios` + `npx expo run:ios --device`):
  o plugin `expo-background-task` adiciona `UIBackgroundModes` (`fetch`, `processing`) e
  `BGTaskSchedulerPermittedIdentifiers`. Sem rebuild, os gatilhos de primeiro plano funcionam, mas a
  tarefa de fundo não.

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

## Cadastro local nunca some (incidente 11/11)

**O que apagou a fazenda e o animal do iPhone (comprovado no banco do aparelho):** o PowerSync só preserva uma linha
criada offline enquanto a operação dela está no `ps_crud`. Quando a fila esvazia, o checkpoint seguinte substitui o
estado local pelo do servidor de sincronização. No teste:

1. `EXPO_PUBLIC_API_URL` = VPS, `EXPO_PUBLIC_POWERSYNC_URL` = IP do Mac (PowerSync local). O app gravava na VPS e baixava
   de outro banco, onde o usuário da VPS não existe (só o bucket global `catalogs` era sincronizado) e o tipo de animal
   "Bovina" do catálogo local não existe na VPS.
2. Fazenda subiu (aplicada na VPS). Animal: `404 ANIMAL_TYPE_NOT_FOUND`; vacinação: `404 ANIMAL_NOT_FOUND`. O upload
   gravava as duas em `sync_rejections` e concluía a transação → `ps_crud` vazio.
3. Checkpoint do PowerSync local (que não tem nenhum desses registros) → fazenda, animal e vacinação apagados do
   aparelho. Sobrou só a cópia do animal e da vacinação dentro de `sync_rejections` ("2 pendências", só Descartar).

**Proteções:**

- Recusa por operação 403/404/405/410… (`*_NOT_FOUND`, acesso) **não conclui a transação**: fica na fila
  (`BatchBlockedUploadError`, retry com espera, motivo no indicador). Só 400/409/422 viram Pendência. DELETE com 404 = já
  apagado (aplicado).
- `requeueDeliveryFailures` (abertura do app e antes de cada envio): toda Pendência que não é corrigível volta ao envio.
  PUT é **regravado na própria tabela** (reaparece no app e volta ao `ps_crud`, o que bloqueia o checkpoint de apagá-lo);
  PATCH/DELETE vão para `sync_outbox`.
- `resolvePowerSyncEndpoint`: se `EXPO_PUBLIC_POWERSYNC_URL` é de rede local e a API não (ou o contrário), a env é
  ignorada e vale o `powersyncUrl` do token; se o token não traz URL útil, a sync **pausa**
  (`PowerSyncEnvironmentMismatchError`, aviso no indicador) e as alterações seguem pelo envio direto à API.

Limite conhecido: uma operação que aponta para algo que **nunca** vai existir no servidor (ex.: tipo de animal de outro
ambiente) fica parada no topo da fila com o motivo no indicador, segurando as seguintes, até alguém resolver. Não some.

## Política: o aparelho manda (11/11)

Regra do Felipe: o que está no app vale mais que o online. Sync/checkpoint/download **nunca** apaga nem troca em
silêncio cadastro local não confirmado; dado novo do servidor que não conflita desce normalmente; empurrar o local por
cima do servidor só depois de o usuário confirmar.

| Situação no upload | O que acontece |
| --- | --- |
| aplicado | sai da fila e fica guardado (`sync_outbox.state = 'sent'` + `snapshot`) até um checkpoint **posterior** trazer a linha. Não trouxe → a linha é restaurada e vira conflito `SERVER_DID_NOT_RETURN`. |
| aplicado com `remapped` (ex.: `animal_type_id: { from, to }`) | grava `sync_id_map` (local → servidor) e corrige o id nas linhas do aparelho (escrita direta, sem nova op). Próximos envios já saem com o id do servidor. |
| recusa 400/409/422 | Pendência (Corrigir), como antes. |
| recusa 403/404/405/410… por op (`*_NOT_FOUND`, acesso) | **conflito** (`state = 'conflict'` + `snapshot`); a transação conclui e a fila anda. Nova tentativa automática com o MESMO dado depois de 5 min, 15 min, 1 h, 6 h (sem forçar nada). |
| rede / 5xx / 408 / 429 / lote inteiro 4xx | fica na fila (retry), como antes. |

- **Guarda** (`localGuard.ts`, `startLocalGuard` em `useSyncTriggers`): a cada checkpoint aplicado e a cada mudança
  nas tabelas sincronizadas, toda linha em conflito/enviada que o download apagou ou trocou volta ao snapshot do
  aparelho (escrita direta em `ps_data__<tabela>`: não gera op). Por linha vale o snapshot mais recente. Limite: o
  PowerSync aplica o checkpoint e a guarda restaura logo depois (pode piscar), mas o dado nunca se perde.
- **Contrato 11/11 da API**: PUT/PATCH de animal com `animal_type_id` leva `animal_type_name` (nome do tipo local) — só
  no envio, nunca no SQLite. O servidor usa o id se conhece; senão o mesmo nome (devolve `remapped`); admin cria;
  master/básico recebem `404 ANIMAL_TYPE_NOT_FOUND` (vira conflito, não Pendência).
- **Tela "Salvos só no aparelho"** (`/configuracoes/conflitos`, link no indicador): lista os conflitos. "Enviar o do
  aparelho" / "Enviar todos" abre confirmação: *"Isso vai sobrescrever no servidor o que estiver diferente com os dados
  deste aparelho"*. Só depois disso `forcePushConflicts` reenvia os PUTs na ordem farms → vaccines → herds → animals →
  animal_vaccinations → shipments → shipment_animals. A API não tem flag de força: PUT já cria/substitui a linha
  inteira. `VACCINE_NOT_FOUND` (vacina de outro ambiente): procura no servidor uma vacina com o mesmo nome e liga a ela;
  sem nenhuma, cria a do aparelho (PUT, master/admin). Tipo de animal fica com o servidor (pelo nome).
- Logout conta conflitos como não enviados (`OUTBOX_UNSENT_COUNT_SQL`).
