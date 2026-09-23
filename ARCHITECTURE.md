# ARCHITECTURE.md — SaaS de IA para Agências de Viagens

> Status: **Fase 0 — proposta para aprovação**. Nada aqui está implementado ainda.
> Documentos relacionados: [PROJECT_PLAN.md](PROJECT_PLAN.md) · [DATABASE.md](DATABASE.md) · [SECURITY.md](SECURITY.md) · [ENVIRONMENT.md](ENVIRONMENT.md)

---

## 1. Visão geral

Produto vertical para agências de viagens: **assistente comercial de turismo (IA no WhatsApp) + CRM de agência + central de atendimento + cotações + propostas + reservas + automações de ciclo de vida da viagem**.

Princípios arquiteturais:

1. **Tenant = agência.** Identificador único e consistente: `agency_id` (em todas as tabelas de tenant). Não usaremos `workspace_id`.
2. **Isolamento em duas camadas:** RLS no Postgres (defesa final) **e** contexto de tenant resolvido no servidor (nunca vindo do cliente).
3. **Regras de negócio no servidor.** O frontend apenas exibe e envia intenções; cálculo de preço, score, permissões e transições de status acontecem no backend/banco.
4. **IA desacoplada da UI.** Claude só é chamado por serviços de backend (worker). A UI nunca fala com a Anthropic.
5. **IA não autoriza nada.** Toda tool do agente recebe o contexto de tenant/conversa do servidor; o modelo só fornece argumentos de negócio, validados por Zod.
6. **Assíncrono por padrão** para tudo que envolve IA ou WhatsApp (webhook → persistir → 200 → fila).
7. **Eventos de domínio** (outbox) como espinha dorsal de follow-ups, automações, notificações e analytics.
8. **Adapters para o futuro** (voos, hotéis, pagamentos, canais) — interfaces agora, implementações depois.
9. **Sem mocks tratados como reais.** Telas sem dados mostram estados vazios reais; integrações não configuradas aparecem como "não conectado".

---

## 2. Diagrama de componentes

```
                         ┌──────────────────────────────────────────────┐
  Consultor / Dono       │                 NEXT.JS (web)                │
  (navegador) ─────────► │  App Router (RSC) · Server Actions · Routes  │
                         │  ├─ /(app)/*       painel da agência          │
                         │  ├─ /onboarding    onboarding                 │
                         │  ├─ /admin         super admin                │
                         │  ├─ /proposal/[t]  proposta pública (sem login)│
                         │  └─ /api/webhooks/whatsapp  (verify + POST)   │
                         └──────────────┬───────────────────────────────┘
                                        │ supabase-js (anon+JWT → RLS)
                                        │ supabase-js (service role, só servidor)
  Cliente final                         ▼
  (WhatsApp) ◄──► Meta Cloud API ──► ┌──────────────────────────────┐
                        ▲            │   SUPABASE                    │
                        │            │   Postgres + RLS + Auth        │
                        │            │   Realtime (inbox/kanban)      │
                        │            │   Storage (logos, PDFs, docs)  │
                        │            │   Tabela jobs (fila)           │
                        │            │   domain_events (outbox)       │
                        │            └──────────────┬───────────────┘
                        │                           │ claim_jobs() SKIP LOCKED
                        │            ┌──────────────▼───────────────┐
                        └─────────── │   WORKER (Node, TypeScript)   │
                                     │   process_message · send_msg  │ ───► Anthropic
                                     │   followup · reminders · ...  │      Claude API
                                     │   event dispatcher/automações │
                                     └──────────────────────────────┘
```

O **worker** é um processo Node de longa duração, no mesmo repositório (`src/worker/`), reutilizando os mesmos módulos de domínio. Ele é necessário porque rotas serverless não são adequadas para loops de tool-use de IA com retries e agendamentos (follow-up em 24h, lembrete 7 dias antes da viagem).

---

## 3. Stack e dependências

### Obrigatórias (definidas no briefing)
| Camada | Tecnologia |
|---|---|
| Web | Next.js (App Router), React, TypeScript (strict) |
| UI | Tailwind CSS, shadcn/ui (Radix), Lucide |
| Banco/Auth/Realtime/Storage | Supabase (`@supabase/supabase-js`, `@supabase/ssr`) |
| IA | Anthropic Claude API (`@anthropic-ai/sdk`) |
| WhatsApp | Meta WhatsApp Cloud API (HTTP via `fetch` — não há SDK oficial Node necessário) |
| Validação | Zod |

### Propostas (precisam de aprovação — ver PROJECT_PLAN §Decisões)
| Pacote | Motivo | Fase |
|---|---|---|
| `vitest` | testes unitários/integração | 1 |
| `@playwright/test` | E2E dos fluxos críticos (opcional, pode ficar para a fase 29) | 29 |
| `supabase` (CLI, dev) | migrations, tipos gerados, `supabase test db` (pgTAP) | 1 |
| `libphonenumber-js` | normalização E.164 de telefones (chave de identidade do cliente) | 6 |
| `@dnd-kit/core` + `@dnd-kit/sortable` | Kanban acessível | 8 |
| `recharts` (via shadcn charts) | gráficos de relatórios/dashboard | 5/26 |
| `@react-pdf/renderer` | PDF da proposta sem Chromium (funciona em serverless) | 18 |
| `tsx` (dev) | rodar o worker localmente | 10 |

Não usaremos: ORM (Supabase + tipos gerados bastam), Redis/BullMQ (fila em Postgres), bibliotecas de estado global, i18n framework (produto em pt-BR; strings centralizadas para futura i18n).

---

## 4. Topologia de deploy (proposta)

| Componente | Recomendação | Alternativa |
|---|---|---|
| Web (Next.js) | Vercel | VPS/Docker |
| Worker | Railway / Fly.io / Render (container Node sempre ligado) | mesmo VPS da web |
| Banco | Supabase Cloud (região São Paulo `sa-east-1`) | — |
| Cron | o próprio worker agenda (jobs com `run_at`) | Vercel Cron → rota protegida por `CRON_SECRET` |

Ambientes: `local` (Supabase CLI via Docker **ou** projeto Supabase de dev), `staging`, `production`. Cada ambiente com projeto Supabase e app Meta/números de teste separados.

---

## 5. Estrutura de diretórios

```
/
├─ src/
│  ├─ app/
│  │  ├─ (marketing)/                 # landing futura (fora do escopo inicial)
│  │  ├─ (auth)/login, signup, forgot-password, invite/[token]
│  │  ├─ onboarding/[step]/
│  │  ├─ (app)/                       # layout com sidebar; exige membro ativo
│  │  │  ├─ dashboard/
│  │  │  ├─ inbox/[conversationId]/   # "Atendimentos"
│  │  │  ├─ crm/                      # kanban
│  │  │  ├─ requests/[id]/            # solicitações de viagem
│  │  │  ├─ quotes/[id]/
│  │  │  ├─ proposals/[id]/
│  │  │  ├─ bookings/[id]/
│  │  │  ├─ customers/[id]/
│  │  │  ├─ calendar/  tasks/  automations/
│  │  │  ├─ agent/  agent/simulator/  agent/knowledge/
│  │  │  ├─ reports/
│  │  │  └─ settings/ (agency, team, pipeline, whatsapp, templates, plan, privacy)
│  │  ├─ admin/                       # super admin (layout próprio)
│  │  ├─ proposal/[token]/            # público, sem login
│  │  └─ api/
│  │     ├─ webhooks/whatsapp/route.ts
│  │     ├─ proposal/[token]/pdf/route.ts
│  │     └─ internal/cron/route.ts    # somente se optarmos por cron externo
│  ├─ modules/                        # domínio (um diretório por contexto)
│  │  └─ <modulo>/
│  │     ├─ schemas.ts                # Zod (entrada/saída)
│  │     ├─ repository.ts             # acesso a dados (sempre recebe TenantContext)
│  │     ├─ service.ts                # regras de negócio
│  │     ├─ actions.ts                # Server Actions (auth + RBAC + chama service)
│  │     ├─ queries.ts                # leituras para RSC
│  │     └─ components/               # UI específica do módulo
│  │   módulos: agencies, members, onboarding, customers, travelers, travel-requests,
│  │            pipeline, deals, lead-scoring, conversations, messages, templates,
│  │            quotes, proposals, bookings, payments, tasks, calendar, followups,
│  │            automations, knowledge, ai-agents, notifications, analytics,
│  │            admin, billing, privacy (LGPD), audit
│  ├─ server/                         # infraestrutura só-servidor ("server-only")
│  │  ├─ auth/        session.ts, tenant-context.ts, rbac.ts, permissions.ts
│  │  ├─ db/          client-server.ts, client-service.ts, database.types.ts (gerado)
│  │  ├─ ai/          client.ts, orchestrator.ts, context-builder.ts, prompts/,
│  │  │               tools/ (um arquivo por tool), completeness.ts, usage.ts, limits.ts
│  │  ├─ channels/    channel-adapter.ts, whatsapp/ (webhook, signature, sender, templates)
│  │  ├─ jobs/        queue.ts, types.ts, handlers/<job>.ts, retry.ts
│  │  ├─ events/      emit.ts, dispatcher.ts, catalog.ts
│  │  ├─ security/    crypto.ts (AES-GCM), rate-limit.ts, tokens.ts, sanitize.ts
│  │  └─ integrations/ providers/ (FlightProvider, HotelProvider, PaymentGateway,
│  │                  CalendarProvider — só interfaces + "NotConfigured" adapters)
│  ├─ worker/         index.ts (loop de claim/execução, graceful shutdown)
│  ├─ components/     ui/ (shadcn), layout/ (sidebar, topbar), shared/
│  └─ lib/            money.ts, dates.ts, phone.ts, result.ts, env.ts (Zod do .env)
├─ supabase/
│  ├─ migrations/     0001_... (ver DATABASE.md §Migrations)
│  ├─ tests/          *.test.sql (pgTAP — RLS e funções)
│  └─ seed.sql        dados de DEV claramente marcados (nunca em produção)
├─ tests/             unit/, integration/, fixtures/ (payloads reais da Meta anonimizados)
└─ docs (raiz):       README, PROJECT_PLAN, ARCHITECTURE, DATABASE, SECURITY,
                      ENVIRONMENT, API (fase 9+), DEPLOYMENT (fase 30)
```

Regras: arquivos < ~300 linhas; `server/` e `modules/*/repository|service` importam `server-only`; nenhum `any` sem comentário justificando; `lib/env.ts` falha no boot se variável obrigatória faltar.

---

## 6. Ciclo de uma requisição autenticada

```
Request → middleware (@supabase/ssr refresh de sessão)
        → Server Action / RSC
        → getTenantContext()
             1. user = supabase.auth.getUser()        (valida JWT no Auth, não só decodifica)
             2. agencyId = cookie "active_agency"     (apenas uma PREFERÊNCIA)
             3. membership = agency_members where user_id = user.id and agency_id = agencyId
                and status = 'active'                  (se não existir → 403 / seleção de agência)
             4. agency.status ∉ {suspended, cancelled} (senão → tela de suspensão)
             → TenantContext { userId, agencyId, role, permissions }
        → requirePermission(ctx, 'quotes.write')
        → service(ctx, input validado por Zod)
        → repository usa client com JWT do usuário (RLS ativa)
```

O `agency_id` enviado pelo cliente **nunca** é usado para autorização; o do `TenantContext` sempre prevalece e é injetado nos inserts.

**Service role** só é usado em: worker, webhook, página pública de proposta, super admin. Nesses caminhos, todo repositório recebe `TenantContext` de sistema (`{ agencyId, actor: 'system' | 'ai' | 'webhook' }`) resolvido a partir de um dado confiável (ex.: `phone_number_id` do webhook → `channels.agency_id`), e toda query filtra por `agency_id` explicitamente. Teste automatizado verifica que nenhuma função de repositório aceita chamada sem contexto.

---

## 7. Modelo de domínio (resumo)

```
Agency ─┬─ Members (role)
        ├─ Customer ─┬─ Identities (whatsapp wa_id, futuro instagram…)
        │            ├─ Preferences (memória estruturada)
        │            ├─ Travelers (acompanhantes reutilizáveis)
        │            └─ Conversation ── Messages
        ├─ Deal (oportunidade no pipeline) ── TravelRequest (o que o viajante quer)
        │     │                                   └─ TravelRequestTravelers
        │     ├─ Quote ── QuoteOptions ── QuoteItems (voo/hotel/transfer/passeio/seguro/outro)
        │     ├─ Proposal (snapshot imutável de 1..N opções, token público)
        │     └─ Booking ── BookingItems · Payments · Documents
        ├─ Tasks · Followups · CalendarEvents · Notes · Tags
        ├─ Automations ── AutomationRuns
        ├─ AI Agents ── Knowledge items · AI runs · AI usage
        └─ Channels (WhatsApp) · MessageTemplates
```

Separação importante (corrige ambiguidade do briefing):
- **Deal** = oportunidade comercial: etapa do pipeline, consultor, valor, score, temperatura, motivo de perda. É o **card do Kanban**.
- **TravelRequest** = especificação da viagem (destino, datas, passageiros, serviços). Status próprio de qualificação (`collecting` → `complete`).
- Relação inicial 1:1 (`travel_requests.deal_id` único). Um cliente pode ter vários deals simultâneos (ex.: Disney em julho e réveillon em Maceió).

---

## 8. Sistema de eventos de domínio

### Mecanismo
- Tabela `domain_events` (outbox): `id, agency_id, type, aggregate_type, aggregate_id, payload jsonb, occurred_at, dispatched_at`.
- Eventos são gravados **na mesma transação** da mudança de estado. Como o supabase-js não oferece transações multi-statement, operações críticas são **funções Postgres (RPC)** ou **triggers** que inserem o evento (ex.: trigger em `proposals` quando `status` muda).
- O worker roda o job `dispatch_events` (loop contínuo): lê eventos não despachados (`FOR UPDATE SKIP LOCKED`), e para cada consumidor registrado enfileira jobs derivados. Consumidores: `followups`, `automations`, `notifications`, `lead-scoring`, `analytics`.

### Catálogo inicial (`server/events/catalog.ts`, tipado com Zod)
| Evento | Emitido quando |
|---|---|
| `lead.created` | novo cliente/deal criado por mensagem ou manualmente |
| `customer.replied` | mensagem inbound em conversa existente |
| `customer.inactive` | job periódico detecta N horas sem resposta |
| `travel_request.updated` / `travel_request.completed` | campos obrigatórios completos |
| `deal.stage_changed` | mudança de etapa |
| `conversation.handoff_requested` / `conversation.mode_changed` | handoff |
| `quote.created` / `quote.ready` | cotação |
| `proposal.sent` / `proposal.viewed` / `proposal.accepted` / `proposal.rejected` / `proposal.expired` | proposta |
| `booking.created` / `booking.cancelled` | reserva |
| `payment.received` / `payment.refunded` | pagamento manual registrado |
| `trip.upcoming` (D-N configurável) / `trip.started` / `trip.completed` | job diário de viagens |

Payloads contêm IDs, não dados pessoais completos (reduz exposição e tamanho).

---

## 9. Filas e jobs

### Por que fila em Postgres
Volume esperado (dezenas de agências, milhares de mensagens/dia) é confortável para Postgres com `SKIP LOCKED`. Evita Redis, mantém tudo transacional e auditável no mesmo banco. Reavaliar (pgmq/Redis) acima de ~50 jobs/s sustentados.

### Tabela `jobs`
`id, agency_id (nullable p/ jobs de plataforma), type, payload jsonb, status, priority, run_at, attempts, max_attempts, last_error, locked_by, locked_at, dedupe_key (unique parcial enquanto pendente), created_at, finished_at`.

- `enqueue_job(type, payload, run_at, dedupe_key)` — `ON CONFLICT (dedupe_key) DO NOTHING/UPDATE run_at` (usado para **debounce**).
- `claim_jobs(worker_id, types[], limit)` — `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) RETURNING *`.
- Lock expirado (worker morreu) → job volta para `queued` após `visibility_timeout`.
- Retry com **backoff exponencial + jitter**: `run_at = now() + min(2^attempts * base, teto) ± jitter`.
- Esgotou tentativas → `status = 'dead'` (dead-letter), notificação para super admin, reprocessável manualmente em `/admin`.
- Erros classificados: `RetryableError` (429, 5xx, timeout) vs `PermanentError` (400 de validação, número inválido, janela fechada) — permanentes vão direto para `failed`, sem retry.

### Tipos de job
| Job | Disparo | Concorrência | Notas |
|---|---|---|---|
| `process_message` | inbound WhatsApp/simulador, debounce 4s por conversa | 1 por conversa (dedupe_key + advisory lock) | orquestra Claude |
| `send_message` | resposta IA, envio humano, follow-up | por canal (respeitar rate da Meta) | idempotente por `messages.id` |
| `dispatch_events` | contínuo | 1 | outbox → jobs |
| `run_automation` | evento casado com automação | n | registra `automation_runs` |
| `followup` | `run_at` agendado | n | verifica condições antes de enviar |
| `proposal_expire` | `valid_until` | n | muda status → `expired` |
| `trip_reminder` | diário (varre bookings D-N) | 1 | pré-viagem |
| `post_trip` | diário (retorno D+N) | 1 | pós-venda |
| `conversation_summary` | a cada N mensagens ou ao fechar | n | reduz contexto futuro |
| `sync_templates` | manual/diário | 1 | status de templates na Meta |
| `usage_rollup` | horário | 1 | agrega consumo por agência |
| `retention_sweep` | diário | 1 | LGPD: anonimização por política |

---

## 10. Arquitetura do WhatsApp

### Modelo de conexão
- **Um Meta App da plataforma** (um `META_APP_SECRET`, um endpoint de webhook).
- Cada agência conecta **seu próprio número** (WABA própria). Tabela `channels` guarda `phone_number_id`, `waba_id`, número exibido e o **access token criptografado** (AES-256-GCM, chave `APP_ENCRYPTION_KEY`).
- MVP de conexão: formulário no onboarding onde a agência informa `phone_number_id`, `waba_id` e token de System User (guiado passo a passo). Evolução: **Embedded Signup** (exige que a plataforma seja *Tech Provider* verificada na Meta — decisão/risco).

### Inbound
```
POST /api/webhooks/whatsapp
 1. Ler corpo RAW (antes de parse)
 2. Validar X-Hub-Signature-256 = HMAC-SHA256(META_APP_SECRET, raw) — comparação timing-safe
    inválida → 401 (sem processar)
 3. Parse Zod do envelope (tolerante a campos desconhecidos)
 4. INSERT webhook_events (hash do corpo como chave única) — repetição exata é ignorada
 5. Para cada change:
    a. channel = channels.phone_number_id = metadata.phone_number_id  → agency_id
       (não encontrado → registra e ignora)
    b. messages[]:  upsert customer (por wa_id/E.164) → conversation aberta
                    INSERT messages (channel_id, external_message_id) ON CONFLICT DO NOTHING
                    se inseriu → enqueue process_message (dedupe por conversa, run_at +4s)
                    atualiza conversations.last_inbound_at (janela de 24h)
    c. statuses[]:  atualiza messages.status (sent/delivered/read/failed) — só avança estado
 6. Responder 200 imediatamente (meta: < 500 ms). Sem chamar Claude aqui.
```
GET do mesmo endpoint: verificação `hub.mode=subscribe` + `hub.verify_token` == `META_WHATSAPP_VERIFY_TOKEN` → retorna `hub.challenge`.

### Outbound
- Toda mensagem de saída (IA, humano, automação) vira primeiro uma linha em `messages` com `status='queued'` e depois um job `send_message(message_id)`.
- O job: verifica janela de 24h (`now() - last_inbound_at < 24h`). Fora da janela → **só template aprovado**; se a mensagem não for template → falha permanente + notificação ao consultor.
- Marca `sending` → chama Graph API → grava `external_message_id` e `sent`. Em 429/5xx → retry com backoff. Não há chave de idempotência na API da Meta: a janela de duplicação é minimizada gravando o estado antes/depois; o risco residual está em SECURITY/Riscos.

### Tipos de mídia
- Texto, botões/listas interativas (resposta), localização, imagem/documento (armazenados no Storage com URL assinada; baixados via Graph API com o token do canal).
- **Áudio (muito comum no Brasil):** Claude não transcreve áudio. MVP: IA responde educadamente que não consegue ouvir e pede texto, ou faz handoff (configurável). Transcrição via provedor STT é decisão pendente.

### Templates (HSM)
Tabela `message_templates` sincronizada com a Meta (nome, idioma, categoria, status de aprovação, variáveis). Follow-up, pré-viagem e pós-venda usam templates quando fora da janela. A UI de automações só permite escolher templates **aprovados**.

### Adapter de canal
```ts
interface ChannelAdapter {
  type: 'whatsapp' | 'simulator' // futuro: 'instagram' | 'messenger' | 'email'
  send(ctx: SystemContext, msg: OutboundMessage): Promise<SendResult>
  canSendFreeform(conversation: Conversation, now: Date): boolean
}
```
O simulador implementa o mesmo adapter (não envia nada externo), permitindo testar o fluxo completo sem WhatsApp.

---

## 11. Arquitetura da IA

### 11.1 Pipeline de orquestração (job `process_message`)
```
MESSAGE(s) pendentes da conversa
 ↓ TENANT RESOLVER      agency_id vem do job (gravado pelo webhook a partir do canal)
 ↓ GUARDS               agência ativa? agente ativo? conversation.mode = 'ai'? limites do plano?
                        rate limit por cliente? (senão: encerra ou handoff)
 ↓ CUSTOMER / CONVERSATION / DEAL / TRAVEL REQUEST  (carregados com filtro agency_id)
 ↓ CONTEXT BUILDER      (ver 11.3)
 ↓ KNOWLEDGE RETRIEVAL  full-text search (pt) nos itens da base da agência, top-k curto
 ↓ CLAUDE               messages.create com tools estritas, loop máx. 5 iterações de tool
 ↓ TOOL CALLS           cada tool: Zod.parse(input) → autorização por contexto → service
 ↓ VALIDATION           resposta final: tamanho, sem links fora da allowlist, sem dados de outros
 ↓ DATABASE             messages(outbound, sender='ai'), ai_runs, ai_usage, domain_events
 ↓ RESPONSE             enqueue send_message
 ↓ WHATSAPP
```
Se novas mensagens do cliente chegarem durante o processamento, ao final o job reenfileira (`last_processed_message_id` na conversa) — o cliente que manda 3 mensagens seguidas recebe **uma** resposta coerente.

### 11.2 Modelos e custos
- Cliente único `server/ai/client.ts` (`@anthropic-ai/sdk`). Modelo por **tarefa**, configurável por env:
  - `ANTHROPIC_MODEL_AGENT` — conversa com o cliente (default proposto: `claude-opus-5`).
  - `ANTHROPIC_MODEL_AUX` — resumos de conversa e tarefas auxiliares (default proposto: `claude-opus-5` com `effort: low`; alternativas mais baratas `claude-sonnet-5` / `claude-haiku-4-5` são **decisão sua**).
- `thinking: { type: "adaptive" }` + `output_config.effort` configurável (proposta inicial `medium` para conversa, calibrar no simulador).
- **Fallback em recusa** habilitado por padrão (parâmetro server-side `fallbacks: "default"` com beta `server-side-fallback-2026-07-01`) e tratamento de `stop_reason: "refusal"` → handoff para humano.
- **Prompt caching:** ordem `tools → system → messages`; tools em ordem determinística e system prompt da agência estável (versão do agente) ficam antes do breakpoint de cache; nada volátil (hora, dados do cliente) no system prompt.
- Estimativa grosseira (a medir no simulador): conversa de qualificação ~15 turnos × ~6k tokens de entrada (majoritariamente em cache) + ~300 de saída ⇒ ordem de **US$ 0,15–0,50 por conversa** com Opus 5 ($5/$25 por MTok). Esse número define limites dos planos.
- Controles: contexto limitado (últimas ~20 mensagens + resumo), `max_tokens` de resposta baixo (respostas de WhatsApp são curtas), máx. 5 iterações de tool por turno, limite diário de turnos IA por conversa e por agência (plano), registro de todo consumo em `ai_usage`.

### 11.3 Contexto enviado ao Claude (nunca o banco inteiro)
| Bloco | Conteúdo | Cache |
|---|---|---|
| tools | definições estritas (`strict: true`, `additionalProperties: false`) | sim |
| system (plataforma) | papel de consultor de viagens, regras invioláveis (não inventar preço/voo/hotel/disponibilidade/política), como tratar instruções do cliente, formato de WhatsApp | sim |
| system (agência) | nome/identidade/tom do agente, especialidades, horários, regras, políticas, formas de pagamento, informações comerciais | sim (por versão do agente) |
| messages: histórico | resumo da conversa + últimas N mensagens | parcial |
| estado do turno (canal de operador, mensagem `system` no meio da conversa, separado do texto do cliente) | dados conhecidos do cliente e da solicitação, **checklist do que falta**, preferências, trechos relevantes da base de conhecimento, data/hora local da agência, se está no horário comercial | não |
| mensagem do cliente | texto delimitado como conteúdo do cliente (dado, não instrução) | não |

### 11.4 Estado da conversa / campos faltantes
`server/ai/completeness.ts` calcula de forma **determinística** (não o modelo) o checklist a partir da `travel_request`:
- **Essenciais:** destino (ou "ainda decidindo"), período (datas exatas ou mês/flexível), composição (adultos, crianças + idades, bebês).
- **Condicionais:** origem (se precisa de voo), idades (se crianças > 0), nº de quartos (se hotel e grupo > 3).
- **Úteis:** orçamento, serviços (voo/hotel/transfer/seguro/passeios), categoria de hotel, regime, preferências.
O prompt orienta a perguntar **no máximo um ou dois itens por mensagem**, na ordem mais natural, e a não perguntar orçamento cedo demais. `status = complete` quando os essenciais estão preenchidos → evento `travel_request.completed`.

### 11.5 Extração estruturada
Decisão proposta: **um único agente com tools estritas** (em vez de uma chamada de extração separada por mensagem) — metade do custo e latência.
- `update_travel_request` recebe um **patch** (`destination`, `departure_date`, `return_date`, `date_flexibility`, `adults`, `children_ages[]`, `infants`, `services{}`, `budget{amount, currency, per:'total'|'person'}`, `hotel_category`, `trip_types[]`…).
- O servidor valida com Zod (datas coerentes, retorno ≥ ida, data futura, idades 0–17, `children = children_ages.length`), normaliza e aplica; campos inválidos voltam como `tool_result` com `is_error` para o modelo corrigir ou perguntar.
- Datas relativas ("10 a 17 de dezembro") são resolvidas pelo modelo usando a data atual fornecida no contexto; o servidor rejeita datas passadas.
- Cada alteração grava `source='ai'` e `evidence_message_id` (auditável; humano pode corrigir e o campo fica `locked_by_human`, que a IA não sobrescreve).
- Nada que o modelo gera é executado como código/SQL; tools são funções fixas com schemas fixos.

### 11.6 Tools do agente
Todas recebem `ToolContext { agencyId, agentId, conversationId, customerId, dealId, travelRequestId }` **do servidor**. Nenhuma tool aceita `agency_id` nem IDs de outros clientes como argumento.

| Tool | O que faz | Restrições |
|---|---|---|
| `get_customer` | dados do cliente **da conversa atual** | sem parâmetro de id |
| `update_customer` | nome, e-mail, cidade | campos allowlist; não altera telefone |
| `create_travel_request` | nova viagem distinta da atual (outro destino/período) | máx. 3 abertas por cliente |
| `update_travel_request` | patch de dados da viagem | só a solicitação da conversa |
| `save_preference` | memória estruturada (ex.: "prefere voo direto") | categorias enum |
| `add_note` | nota interna no deal | texto limitado |
| `add_tag` | aplica tag | somente tags existentes da agência |
| `create_task` | ex.: "Preparar cotação" | tipos enum; atribui ao consultor do deal |
| `request_human` | handoff | `reason` enum + resumo |
| `schedule_followup` | lembrete de retomar contato | só dentro de regras do plano/janela |
| `record_signal` | sinal comercial (pediu cotação, intenção de compra, insatisfação) | enum; **peso do score é do servidor** |
| `get_agency_information` | horários, políticas, formas de pagamento | dados da própria agência |
| `search_knowledge_base` | busca FAQ/políticas/destinos | apenas itens publicados da agência |

**Removidos do toolset da IA (proposta):** `assign_consultant` e `move_pipeline`. Mudança de etapa e atribuição passam a ser **efeitos determinísticos** de eventos (ex.: `travel_request.completed` → etapa "Solicitação completa" + distribuição round-robin), executados por automações. A IA não decide roteamento comercial.

### 11.7 Handoff IA ↔ humano
- `conversations.mode ∈ {ai, human}`. Em `human`, o `process_message` não chama Claude (apenas registra, notifica).
- Gatilhos: tool `request_human` (cliente pediu atendente, pronto para fechar, precisa cotar, IA sem resposta, insatisfação, negociação), recusa do modelo, erro repetido, regras da agência (palavras-chave, etapa do pipeline, valor), limite de consumo atingido.
- "Assumir atendimento" → `mode=human`, `assigned_user_id`, evento, auditoria. "Devolver para IA" → `mode=ai` (a IA recebe um resumo do que o humano fez).
- **Proposta:** se um humano enviar mensagem pelo inbox enquanto `mode=ai`, a conversa muda automaticamente para `human` (evita IA e humano falando ao mesmo tempo).

### 11.8 Memória
- Curto prazo: últimas N mensagens.
- Médio prazo: `conversations.summary` (job `conversation_summary`).
- Longo prazo: **estruturada** — `customer_preferences` (categoria, valor, fonte, evidência), `travelers`, histórico de viagens/bookings. O contexto do turno inclui as preferências relevantes, não conversas antigas.

### 11.9 Simulador
Conversa com `channel.type='simulator'` e `conversations.is_simulation=true` (excluída de analytics, limites próprios). Usa o mesmo orquestrador e adapter. A UI mostra: chat, patch extraído, estado da solicitação/checklist, tool calls (entrada/saída/erros), tokens (entrada/cache/saída), custo estimado, latência. Permite "resetar" a simulação e testar versões do agente antes de publicar.

---

## 12. Cotações (Quote Engine)

```
Deal/TravelRequest → Quote (1..N por deal, uma "ativa")
                        └─ QuoteOption ("Opção 1 — Resort all inclusive", "Opção 2 — Pousada")
                              └─ QuoteItem (type: flight | hotel | transfer | tour | insurance | other)
```
- `quote_items` tem colunas comuns (descrição, fornecedor, datas, quantidade, custos, preço) + `details jsonb` validado por **união discriminada Zod por `item_type`** (voo: companhia, trechos[], bagagem, escalas; hotel: nome, categoria, quarto, regime, check-in/out…). Evita 6 tabelas quase iguais e aceita dados de futuros provedores.
- **Cálculo (função pura `modules/quotes/pricing.ts`, também usada no servidor ao salvar):**
  - por item: `price = cost + markup + pass_through_fees`; `commission` = comissão a receber do fornecedor (não cobrada do cliente).
  - por opção: `subtotal = Σ price` · `service_fee` (taxa de serviço/RAV/DU) · `discount` · `total = subtotal + service_fee − discount` · `margin = Σ markup + service_fee − discount` · `commission_total = Σ commission` · `gross_profit = margin + commission_total`.
  - valores em **centavos (bigint)**; uma moeda por cotação (MVP); arredondamento banker's só no final.
  - totais **sempre recalculados no servidor**; o valor enviado pelo cliente é ignorado.
- Visibilidade: margem/comissão/custo só para perfis com `quotes.view_margin`; nunca entram no snapshot da proposta.
- Futuro: `FlightProvider.search()` / `HotelProvider.search()` retornam `QuoteItemDraft` normalizados → mesma engine.

---

## 13. Propostas

- Criada a partir de uma cotação escolhendo 1..N opções. Ao marcar `ready`/`sent`, grava-se um **snapshot imutável** (`snapshot jsonb` + `version`) com somente dados voltados ao cliente (logo, cliente, destino, datas, passageiros, itens sem custo/margem, investimento, formas de pagamento, validade, observações). Edições posteriores geram nova versão; a antiga continua válida no link até ser substituída/expirada.
- **Link público** `/proposal/[token]`: token de 32 bytes aleatórios (base64url, ~256 bits). O banco guarda apenas `HMAC-SHA256(PROPOSAL_TOKEN_PEPPER, token)`. A página é Server Component que busca pelo hash com service role e renderiza só o snapshot. `noindex`, sem dados internos, rate limit por IP.
- Visualizações: `proposal_views` (timestamp, user-agent resumido, **hash** do IP com salt — sem IP em claro), atualiza `views_count`, `first_viewed_at`, `last_viewed_at`; primeira visualização emite `proposal.viewed` (status `sent → viewed`). Acessos pelo próprio painel (usuário logado da agência) não contam.
- Cliente pode "Aceitar opção X" / "Quero ajustar" na página → evento → handoff ao consultor (aceite final e reserva são confirmados por humano no MVP).
- **Máquina de estados:** `draft → ready → sent → viewed → negotiating → accepted | rejected`; `expired` automático por `valid_until` (a partir de `sent|viewed|negotiating`); transições inválidas rejeitadas no banco (função `transition_proposal`).
- **PDF:** `@react-pdf/renderer` renderizando o mesmo snapshot; gerado sob demanda e salvo no Storage (bucket privado) com URL assinada curta para envio no WhatsApp como documento.

---

## 14. Follow-up, automações e lead score

### Follow-up
- `followups` é a entidade de negócio (quem, quando, mensagem/template, condição de cancelamento, status). O job apenas executa.
- Criados por: regras padrão (ex.: `proposal.sent` → +24h), automações, IA (`schedule_followup`) ou manualmente.
- Antes de enviar, o job reavalia: o cliente respondeu? proposta ainda aberta? conversa em modo humano? dentro da janela (senão template)? horário comercial da agência? Se não fizer mais sentido → `skipped`.
- `customer.replied` cancela follow-ups marcados com `cancel_on_reply`.

### Automações
`TRIGGER (evento) → CONDITIONS (JSON validado por Zod: campo, operador, valor — sem código arbitrário) → ACTIONS (lista tipada)`.
Ações: `send_whatsapp` (template), `create_task`, `assign_consultant`, `move_pipeline` (por `system_key` da etapa), `add_tag`, `schedule_followup`, `notify_consultant`, `send_proposal`, `request_human`. Cada execução gera `automation_runs` com resultado por ação. Proteções: limite de execuções por deal/automação, sem loops (ação não re-dispara a mesma automação no mesmo evento-raiz: `causation_id`).

### Lead score (determinístico)
`lead_score_rules` por agência (padrões do briefing: destino +10, datas +10, passageiros +10, orçamento +15, completa +15, pediu cotação +20, visualizou proposta +10, intenção de compra +10). Pontos concedidos uma vez por regra por deal (`lead_score_events`), recálculo por evento, teto 100. Temperatura via faixas configuráveis em `agency_settings` (padrão 0–30 frio, 31–60 morno, 61–100 quente). A IA só registra **sinais** (enum); o servidor aplica os pesos.

---

## 15. Realtime e notificações
- Supabase Realtime (`postgres_changes`, que respeita RLS) para: lista/mensagens do inbox, cards do Kanban, notificações do usuário.
- `notifications` (por usuário, por agência) geradas pelo consumidor de eventos: 🔥 lead quente, ✈️ nova solicitação, 📋 cotação necessária, 👀 proposta visualizada, 💬 cliente respondeu, 💰 proposta aceita, 📅 viagem próxima, ⚠️ follow-up atrasado.

---

## 16. Integrações futuras (somente interfaces agora)
```ts
interface FlightProvider { search(q: FlightSearch): Promise<FlightOffer[]> }
interface HotelProvider  { search(q: HotelSearch):  Promise<HotelOffer[]> }
interface PaymentGateway { createCharge(...); getStatus(...); handleWebhook(...) }
interface CalendarProvider, EmailProvider, ChannelAdapter (instagram/messenger)
```
Registro em `integration_connections` (agência, provedor, credenciais criptografadas, status). Implementação padrão `NotConfigured*` que lança erro explícito — nunca retorna dados fictícios. Nada de scraping.

---

## 17. Fluxos

### 17.1 Fluxo do cliente (viajante)
```
Manda "Queria ir para Maceió em dezembro" no WhatsApp da agência
 → IA responde em segundos, conversa natural, coleta datas/pessoas/serviços
 → Solicitação completa → IA avisa que um consultor vai preparar opções (sem inventar preço)
 → Consultor monta cotação → proposta enviada (link + PDF no WhatsApp)
 → Cliente abre o link (tracking) → follow-up automático se silêncio
 → Negociação com consultor → aceite → reserva → pagamentos registrados
 → Lembretes pré-viagem (D-7, D-1) → viagem → pós-venda (D+2: feedback/indicação)
```

### 17.2 Fluxo da IA
Ver §11.1. Resumo: job → guards → contexto mínimo → Claude (tools estritas) → validação Zod → persistência → mensagem na fila de envio.

### 17.3 Fluxo do WhatsApp
Ver §10. Resumo: webhook assinado → dedupe (`webhook_events`, `external_message_id`) → persistir → 200 → `process_message` (debounce) → `send_message` (janela 24h / template) → status callbacks.

### 17.4 Fluxo de cotação
```
travel_request.completed → tarefa "Preparar cotação" p/ consultor → etapa COTAÇÃO EM ANDAMENTO
 → consultor cria Quote → opções → itens (voo, hotel, …) → engine calcula totais/margem
 → marca "pronta" (quote.ready) → etapa COTAÇÃO PRONTA
```

### 17.5 Fluxo de proposta
```
Quote pronta → "Gerar proposta" (seleciona opções, validade, pagamento, observações)
 → preview → READY (snapshot) → "Enviar" (link + PDF via WhatsApp; template se fora da janela)
 → SENT (proposal.sent → follow-up +24h) → VIEWED (proposal.viewed → notifica, +score)
 → NEGOTIATING (cliente pede ajuste) → nova versão
 → ACCEPTED (proposal.accepted → booking draft + etapa RESERVA) | REJECTED (motivo) | EXPIRED
```

---

## 18. Observabilidade
- Logs estruturados JSON (`requestId`, `jobId`, `agencyId`, sem PII em claro).
- `ai_runs`/`ai_usage` para custo e latência; `jobs` com `last_error`; `webhook_events` com status.
- `/admin` com erros recentes, dead-letter, consumo por agência.
- Futuro: Sentry/OpenTelemetry (decisão na fase 30).

---

## 19. Riscos técnicos (resumo — detalhado em PROJECT_PLAN §Riscos)
1. Aprovação/verificação Meta (Tech Provider, templates, qualidade do número) fora do nosso controle.
2. Janela de 24h: follow-ups/pré/pós-venda dependem de templates aprovados.
3. Custo de IA por conversa — precisa medição real antes de fixar planos.
4. Duplicidade de envio no WhatsApp (sem chave de idempotência na API).
5. Transações multi-tabela via supabase-js → exige funções RPC para operações críticas.
6. Worker sempre ligado = um componente a mais para operar.
7. Áudios de clientes sem transcrição no MVP.
8. Qualidade da extração com datas ambíguas/relativas e linguagem informal.
9. Supabase CLI local exige Docker (Windows) — alternativa: projeto Supabase de dev.
