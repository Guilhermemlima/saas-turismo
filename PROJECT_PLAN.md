# PROJECT_PLAN.md — SaaS de IA para Agências de Viagens

> **Estado atual (2026-09-23):** fundação, onboarding/equipe, solicitações de viagem e CRM Kanban entregues — fases 1, 2, 3, 4, 7, quase toda a 8 e parte de 5 e 6 (ver §9). Produção: https://saas-turismo-ivory.vercel.app
> IA e WhatsApp adiados por decisão do usuário; hospedagem na Vercel; Supabase como banco principal
> (migração para Docker/self-hosted avaliada perto do fim do projeto).
> Referências: [ARCHITECTURE.md](ARCHITECTURE.md) · [DATABASE.md](DATABASE.md) · [SECURITY.md](SECURITY.md) · [ENVIRONMENT.md](ENVIRONMENT.md)

---

## 1. Visão do produto
SaaS multi-tenant **exclusivo para agências de viagens**: assistente comercial de turismo (IA no WhatsApp) + CRM de agência + central de atendimento + cotações + propostas + reservas + automações de pré e pós-viagem. Objetivo: reduzir trabalho operacional e aumentar a capacidade de atendimento e acompanhamento comercial.

---

## 2. Análise do briefing — inconsistências identificadas e resolução proposta

| # | Inconsistência / lacuna | Resolução proposta |
|---|---|---|
| 1 | **Janela de 24h do WhatsApp.** Follow-up "após 24h sem resposta", lembrete D-7 e pós-venda caem fora da janela de atendimento; a Meta rejeita texto livre nesses casos | Módulo de **templates aprovados (HSM)**; follow-ups/pré/pós-venda usam template quando fora da janela; UI de automações só aceita templates aprovados |
| 2 | **Fila (fase 15) vem depois do WhatsApp (14) e da IA (10–12)**, mas o §58 exige processamento assíncrono desde o primeiro webhook | Fila/jobs + eventos de domínio **antecipados para a fase 10**, antes da IA |
| 3 | **Onboarding (fase 4)** tem etapas 5–8 (agente, WhatsApp, simulador, ativar IA) que dependem das fases 12–15 | Fase 4 entrega o framework + etapas 1–4; etapas 5–8 aparecem "bloqueadas/em breve" e são ativadas nas fases correspondentes |
| 4 | **Tarefas só na fase 22**, mas a tool `create_task` da IA é usada na fase 13 e o CRM precisa de "preparar cotação" | Tabela/serviço de tarefas básico na **fase 8**; agenda e UI completa na 22 |
| 5 | **Follow-up (19) antes de Automações (23)** — seriam dois motores | Um único motor de eventos (fase 10); follow-ups são o primeiro consumidor; a fase 23 entrega o construtor visual de automações |
| 6 | **`travel_requests` × `deals` × pipeline**: o briefing põe `assigned_consultant` e `lead_score` na solicitação e também lista `deals` | `deal` = card/oportunidade (etapa, consultor, score, valor); `travel_request` = especificação da viagem (1:1 no MVP) |
| 7 | **`adults/children/children_ages` e entidade `travelers`** podem divergir | Contagens = composição declarada (IA coleta cedo); `children` gerado de `children_ages`; `travelers` nominais preenchidos na reserva; UI alerta divergência |
| 8 | **"Nacional/Internacional" listados como tipo de viagem** junto de "Lua de mel/Família" — são dimensões diferentes | `trip_scope` (nacional/internacional) + `trip_types[]` (múltiplos); especialidades da agência reutilizam os mesmos enums |
| 9 | **Etapas personalizáveis** quebrariam automações/score/relatórios que dependem delas | `pipeline_stages.system_key` semântico; a agência renomeia/reordena livremente |
| 10 | **Tools `move_pipeline` e `assign_consultant` para a IA** contradizem "IA nunca determina autorização" e "não permitir que Claude determine o score" | Removidas do toolset da IA; viram ações determinísticas de automações. A IA registra **sinais** (`record_signal`) e pede humano |
| 11 | **Extração estruturada (fase 11) separada do agente (12)** implicaria duas chamadas de modelo por mensagem | Um agente com tools estritas (patch validado por Zod) + checklist determinístico de campos faltantes. Metade do custo/latência |
| 12 | **Tabela `roles`** sugerida, mas os perfis são fixos | Enum `agency_role` + matriz de permissões; papéis customizados ficam para o futuro |
| 13 | **Dashboard na fase 5** sem dados reais ainda | Fase 5 entrega layout/shell e KPIs reais com estados vazios; cada fase seguinte "liga" seus KPIs. Nenhum número fictício |
| 14 | **Áudio**: muito comum no Brasil e Claude não transcreve áudio | MVP: IA pede texto educadamente ou faz handoff (configurável). Transcrição = decisão pendente |
| 15 | **Conexão do WhatsApp no onboarding** pressupõe Embedded Signup, que exige a plataforma ser *Tech Provider* verificada na Meta | MVP: conexão guiada manual (phone number ID + WABA + token de System User). Embedded Signup quando a verificação sair |
| 16 | **Moeda**: viagens internacionais têm itens em USD/EUR | MVP: uma moeda por cotação; multi-moeda com câmbio congelado = evolução |
| 17 | **Status PAGAMENTO no pipeline × status de pagamento do booking** | Status do booking é derivado dos registros de pagamento; automação pode mover o deal por `payment.received` |
| 18 | **Status `VIEWED` da proposta** é também um evento repetível | Status muda só na 1ª visualização; demais em `proposal_views` e contadores |
| 19 | **Humano respondendo enquanto IA está ativa** não está definido | Proposta: mensagem humana pelo inbox troca automaticamente para `HUMAN` |
| 20 | **Horário de atendimento × IA 24h** não definido | Configuração por agência: IA responde sempre / responde e agenda handoff / silêncio |
| 21 | **Transações**: supabase-js não faz transação multi-tabela | Operações críticas como funções RPC no Postgres |
| 22 | **Super admin "visualizar"** dados de agências conflita com LGPD e isolamento | Super admin vê agregados; acesso a dados via "sessão de suporte" auditada e visível ao owner |

---

## 3. Melhorias arquiteturais propostas
1. **FKs compostas `(agency_id, id)`** — o banco impede relacionamentos cruzados entre agências, mesmo com service role.
2. **Outbox de eventos no Postgres** gravado na mesma transação (triggers/RPC) — follow-ups, automações, notificações e analytics sem perder eventos.
3. **Fila em Postgres com `SKIP LOCKED`**, debounce por conversa (cliente que manda 3 mensagens seguidas recebe 1 resposta), dead-letter e reprocessamento no `/admin`.
4. **Worker Node separado** no mesmo repositório (reutiliza módulos) — loops de IA e agendamentos fora do serverless.
5. **Snapshot imutável e versionado da proposta** — o que o cliente viu nunca muda por edição posterior da cotação.
6. **`quote_options`** — várias opções por cotação ("Resort" × "Pousada"), como agências realmente trabalham.
7. **Detalhes de item em JSONB com união discriminada Zod** — uma tabela de itens, pronta para dados de APIs de voo/hotel.
8. **Proveniência dos dados extraídos pela IA** (`source`, `evidence_message_id`, `locked_by_human`) — auditável e o humano sempre prevalece.
9. **`customer_identities`** — cliente pronto para Instagram/Messenger sem migração.
10. **`deal_stage_history`** — funil e tempo por etapa confiáveis.
11. **Temperatura derivada** (não armazenada) — muda de faixa sem reprocessar dados.
12. **Canal "simulator"** usando o mesmo adapter — o simulador testa exatamente o código de produção.
13. **Links na resposta da IA restritos a allowlist** — impede que prompt injection faça a IA enviar links de phishing.
14. **Mascaramento de CPF/cartão** antes de enviar ao modelo (LGPD).

---

## 4. Decisões que precisam da sua aprovação
| # | Decisão | Recomendação |
|---|---|---|
| D1 | Identificador de tenant | `agency_id` |
| D2 | Modelo de IA do agente de conversa | `claude-opus-5` (effort `medium`, calibrar no simulador) |
| D3 | Modelo para tarefas auxiliares (resumos) | `claude-opus-5` com effort `low`; ou mais barato (`claude-sonnet-5` / `claude-haiku-4-5`) — **escolha sua (custo × qualidade)** |
| D4 | Fila | Postgres (`jobs` + `SKIP LOCKED`) + worker Node dedicado |
| D5 | Hospedagem | Web na Vercel + worker em Railway/Fly/Render + Supabase região São Paulo |
| D6 | Ambiente local | Supabase CLI com Docker Desktop (Windows) **ou** projeto Supabase de dev na nuvem |
| D7 | Conexão WhatsApp no MVP | Manual guiada (sem Embedded Signup) até a verificação de Tech Provider |
| D8 | Áudio de clientes | MVP: pedir texto / handoff. Transcrição exigiria um provedor STT adicional |
| D9 | Ferramentas `move_pipeline`/`assign_consultant` fora da IA | Sim (viram automações determinísticas) |
| D10 | Mensagem humana assume a conversa automaticamente | Sim |
| D11 | Visibilidade do consultor | Configurável por agência; padrão "vê todos da agência" |
| D12 | Documentos pessoais (CPF/passaporte) | Não armazenar no MVP; se necessário, tabela separada criptografada |
| D13 | Dependências extras | `vitest`, `libphonenumber-js`, `@dnd-kit/*`, `recharts`, `@react-pdf/renderer`, `tsx`, Supabase CLI; Playwright opcional |
| D14 | Uma moeda por cotação no MVP | Sim |
| D15 | Rate limiting | Postgres (sem Redis) no início |
| D16 | Idioma | Produto só em pt-BR no início (strings centralizadas) |
| D17 | Reordenação de fases (§5) | Aprovar a ordem ajustada |
| D18 | Aspectos jurídicos LGPD | Termos/DPA/política de privacidade com transferência internacional (Anthropic/Meta) — requer revisão jurídica sua |
| D19 | MFA obrigatório para super admin | Sim |
| D20 | Limites de planos (valores) | Definir após medir custo real por conversa (fase 14) |

---

## 5. Definition of Done (vale para todas as fases)
1. `npm run lint` sem erros
2. `npm run typecheck` (`tsc --noEmit`) sem erros
3. `npm run build` sem erros
4. `npm test` (Vitest) e `supabase test db` (pgTAP) passando
5. `supabase db reset` aplica todas as migrations do zero
6. Checklist de segurança (SECURITY.md §14) atendido
7. Nenhum dado mockado exibido como real; integrações sem credencial mostram "não configurado"
8. Documentação atualizada (este arquivo + docs afetados)
9. Commits pequenos no padrão Conventional Commits

---

## 6. Fases

Ordem **ajustada** (mudanças marcadas com ⇄). Numeração entre parênteses = fase original do briefing.

### Fase 0 — Arquitetura e planejamento ✅
- **Objetivo:** analisar requisitos e definir arquitetura, banco, segurança, ambiente e roadmap.
- **Tarefas:** documentos PROJECT_PLAN, ARCHITECTURE, DATABASE, SECURITY, ENVIRONMENT, `.env.example`, `.gitignore`.
- **Dependências:** nenhuma.
- **Testes:** revisão sua.
- **Critério de conclusão:** documentos aprovados e decisões D1–D20 respondidas.

### Fase 1 — Fundação Next.js + Supabase
- **Objetivo:** projeto rodando com qualidade automatizada.
- **Tarefas:** `git init`; Next.js (App Router, TS strict, `src/`); Tailwind + shadcn/ui + Lucide; tema dark/light com tokens próprios (tipografia, espaçamentos, cores — identidade não genérica); ESLint (regras: sem `any`, sem `dangerouslySetInnerHTML`, restrição de import do service client); Vitest; Supabase CLI (`supabase/`), migrations 0001–0002; clientes Supabase (browser/server/service) em `server/db`; `lib/env.ts` com Zod; scripts `lint`, `typecheck`, `build`, `test`, `db:reset`, `db:types`, `check:env`; README.
- **Dependências:** Fase 0; credenciais Supabase (ou Docker).
- **Testes:** teste unitário de `env.ts`; build limpo; migration aplica do zero.
- **Critério:** app sobe em `localhost:3000` com página mínima; todos os scripts verdes.

### Fase 2 — Autenticação
- **Objetivo:** cadastro, login, logout, recuperação de senha, confirmação de e-mail.
- **Tarefas:** migration 0003 (`profiles` + trigger); páginas `(auth)`; middleware `@supabase/ssr`; `getUser()` server-side; proteção de rotas; rate limit básico de login.
- **Dependências:** Fase 1.
- **Testes:** fluxo de signup/login (integração), rota protegida redireciona, perfil criado automaticamente.
- **Critério:** usuário autentica e acessa uma rota protegida; anônimo é bloqueado.

### Fase 3 — Multi-tenant + RLS + RBAC
- **Objetivo:** isolamento completo entre agências e permissões por perfil.
- **Tarefas:** migrations 0004–0008 (plans, platform_admins, agencies, settings, members, invitations, subscriptions, helpers RLS, policies, audit_logs); `getTenantContext()`, `requirePermission()`, matriz de permissões; seleção de agência ativa; convites de equipe; trigger `prevent_agency_change`.
- **Dependências:** Fase 2.
- **Testes:** pgTAP de isolamento (duas agências × cinco papéis × CRUD); testes de `requirePermission`; tentativa de forjar `agency_id` falha.
- **Critério:** 100% das tabelas com RLS forçada e testada; nenhuma rota sem autorização.

### Fase 4 — Onboarding da agência
- **Objetivo:** agência criada e configurada por um wizard com progresso.
- **Tarefas:** RPC `create_agency_with_owner` (cria settings, pipeline/etapas padrão, regras de score, automações padrão desativadas); etapas 1 (dados + logo no Storage), 2 (equipe/convites), 3 (especialidades), 4 (horários); etapas 5–8 visíveis e bloqueadas até suas fases; barra de progresso.
- **Dependências:** Fase 3.
- **Testes:** criação atômica; validação Zod (CNPJ opcional com dígito verificador, telefone E.164); upload restrito à própria agência.
- **Critério:** nova agência completa as etapas 1–4 e cai no painel.

### Fase 5 — Dashboard (shell)
- **Objetivo:** layout premium do painel e dashboard com KPIs reais.
- **Tarefas:** sidebar (Dashboard, Atendimentos, CRM, Solicitações, Cotações, Propostas, Reservas, Clientes, Agenda, Tarefas, Automações, Agente IA, Relatórios, Configurações) — itens de fases futuras ocultos ou marcados "em breve", **sem páginas vazias**; topbar (agência, notificações, tema); dashboard com estrutura de cards e estados vazios reais; responsivo.
- **Dependências:** Fase 4.
- **Testes:** renderização por papel (itens de menu conforme permissão); acessibilidade básica.
- **Critério:** navegação completa e responsiva; nenhum número fictício.

### Fase 6 — Clientes
- **Objetivo:** cadastro e perfil do viajante.
- **Tarefas:** migration 0011; lista com busca/filtros (nome, telefone, tag, consultor); criação/edição; normalização E.164; tags; notas; preferências; viajantes (acompanhantes); perfil com abas (histórico preenchido nas fases seguintes).
- **Dependências:** Fase 5.
- **Testes:** unicidade de telefone por agência; isolamento; validações.
- **Critério:** CRUD completo com RLS e busca performática (índices).

### Fase 7 — Solicitações de viagem
- **Objetivo:** entidade central da viagem e o deal associado.
- **Tarefas:** migrations 0012 (pipelines/etapas/deals) e 0013 (travel_requests, travel_request_travelers); formulário manual; `completeness.ts` (checklist determinístico) com testes; página de solicitação; `field_sources`.
- **Dependências:** Fase 6.
- **Testes:** regras de completude (tabela de casos), checks de datas/idades, 1:1 deal↔request.
- **Critério:** consultor cria solicitação manual; status `complete` calculado corretamente.

### Fase 8 — CRM de turismo
- **Objetivo:** Kanban especializado com score e temperatura.
- **Tarefas:** Kanban (@dnd-kit) com card (viajante, destino, datas, passageiros, orçamento, proposta, consultor, último contato, próximo follow-up, temperatura); personalização de etapas (nome, cor, ordem) preservando `system_key`; `move_deal_stage` + histórico; migrations 0014 (lead scoring) e 0015 (tasks base); motor de score determinístico; faixas de temperatura configuráveis; Realtime no quadro.
- **Dependências:** Fase 7.
- **Testes:** score idempotente, temperatura por faixa, mover etapa grava histórico, isolamento no Realtime.
- **Critério:** pipeline padrão de 13 etapas funcional e personalizável.

### Fase 9 — Inbox (Atendimentos)
- **Objetivo:** central de atendimento em três colunas.
- **Tarefas:** migrations 0016–0017 (channels, conversations, messages, templates, notifications, Realtime); layout CONVERSAS | CHAT | DADOS DA VIAGEM (cliente, viagem, comercial editáveis); modos AI/HUMAN com "Assumir atendimento"/"Devolver para IA"; envio humano cria mensagem `queued` (entrega real a partir da fase 15; até lá só no canal simulador); notificações in-app; API.md iniciado.
- **Dependências:** Fase 8.
- **Testes:** troca de modo auditada; Realtime isolado; XSS em conteúdo de mensagem.
- **Critério:** inbox funcional sobre conversas do simulador/dados criados manualmente, sem fingir conexão com WhatsApp.

### Fase 10 ⇄ (15) — Fila, jobs e eventos de domínio
- **Objetivo:** infraestrutura assíncrona confiável.
- **Tarefas:** migrations 0018–0020; `enqueue/claim/complete/fail`; worker (`src/worker`) com concorrência, graceful shutdown, backoff com jitter, dead-letter; outbox `domain_events` + dispatcher + catálogo tipado; rate limit em Postgres; tela de jobs mortos (base para /admin).
- **Dependências:** Fase 9.
- **Testes:** dois workers não pegam o mesmo job; retry/backoff; dedupe/debounce; evento emitido na mesma transação; job morto após N tentativas.
- **Critério:** eventos de fases anteriores (deal criado, etapa alterada) fluem pelo outbox para notificações.

### Fase 11 ⇄ (10) — Claude API base
- **Objetivo:** cliente de IA robusto e mensurável.
- **Tarefas:** `server/ai/client.ts` (`@anthropic-ai/sdk`, modelo por tarefa via env, adaptive thinking, effort, fallback de recusa, prompt caching); migration 0021 (ai_usage, ai_runs, usage_counters); cálculo de custo estimado; limites por agência; tratamento de erros tipados (429/5xx retry, 400 permanente); `check:anthropic`.
- **Dependências:** Fase 10; **credencial `ANTHROPIC_API_KEY`**.
- **Testes:** unitários com cliente injetado (sem chamadas reais no CI); um teste de integração opcional real marcado.
- **Critério:** chamada real registrada em `ai_usage` com tokens, custo e latência.

### Fase 12 ⇄ (11) — Extração estruturada
- **Objetivo:** conversa → dados de viagem validados.
- **Tarefas:** schemas Zod de patch (`update_travel_request`, `save_preference`, `update_customer`); normalização (datas relativas → absolutas com data atual da agência, idades, crianças); regras de rejeição; proveniência e `locked_by_human`; suíte de casos em pt-BR ("eu, minha esposa e meu filho de 7 anos", "do dia 10 ao 17", "semana do réveillon", "umas 4 pessoas").
- **Dependências:** Fase 11.
- **Testes:** conjunto de avaliação com ≥ 40 frases reais-like; precisão medida e registrada.
- **Critério:** ≥ 95% de acerto nos campos essenciais do conjunto de avaliação; zero escrita sem validação.

### Fase 13 ⇄ (12) — Agente IA
- **Objetivo:** consultor virtual configurável por agência.
- **Tarefas:** migration 0022 (ai_agents, knowledge_items); tela de configuração (nome, identidade, persona, tom, mensagem inicial, regras, FAQ, políticas, pagamentos, informações comerciais) com versionamento/publicação; base de conhecimento com busca full-text pt; orquestrador (`process_message`) com context builder, tools estritas (§11.6 ARCHITECTURE), máx. iterações, validação de saída, handoff (tool + regras + recusa); memória (preferências + resumo via `conversation_summary`); prompt de plataforma com proibições (não inventar preço/voo/hotel…).
- **Dependências:** Fase 12.
- **Testes:** tools rejeitam contexto cruzado; prompt injection (red team) não vaza dados nem altera autorização; handoff dispara corretamente; IA não pergunta o que já sabe.
- **Critério:** conversa de qualificação completa gera solicitação `complete`, tarefa "Preparar cotação" e handoff.

### Fase 14 ⇄ (13) — Simulador
- **Objetivo:** testar o agente antes do WhatsApp; ativar etapa 7 do onboarding.
- **Tarefas:** migration 0023; canal simulator; UI com chat, dados extraídos, checklist, tool calls, tokens (entrada/cache/saída), custo, latência, erros; reset; comparação de versões do agente; medição do custo médio por conversa (insumo para D20).
- **Dependências:** Fase 13.
- **Testes:** simulações não entram em analytics; limites próprios.
- **Critério:** agência simula atendimento completo e vê todos os artefatos; relatório de custo médio gerado.

### Fase 15 ⇄ (14) — WhatsApp
- **Objetivo:** atendimento real pelo WhatsApp; ativar etapas 6 e 8 do onboarding.
- **Tarefas:** migration 0024; webhook GET/POST (assinatura, dedupe, persistência, 200 rápido); resolução de tenant por `phone_number_id`; conexão guiada do número (token criptografado); `send_message` com janela 24h e templates; status callbacks; mídia (imagem/documento no Storage; áudio conforme D8); sincronização de templates; debounce.
- **Dependências:** Fase 14; **credenciais Meta** (ENVIRONMENT §2.3).
- **Testes:** fixtures reais de payload; assinatura inválida → 401; reentrega não gera resposta duplicada; fora da janela bloqueia texto livre.
- **Critério:** mensagem real do celular → resposta da IA → dados no inbox/CRM, com idempotência comprovada.

### Fase 16 — Cotações
- **Objetivo:** consultor monta cotações com múltiplas opções.
- **Tarefas:** migration 0025; builder de cotação (opções, itens por tipo com formulários específicos); `pricing.ts` (subtotal, taxas, desconto, margem, comissão, total) recalculado no servidor; visibilidade de margem por permissão; eventos `quote.created/ready`.
- **Dependências:** Fase 8 (pode ser feita em paralelo às 11–15 se necessário).
- **Testes:** engine de preço com casos de borda (arredondamento, desconto > subtotal rejeitado); atendente não vê margem.
- **Critério:** cotação com 2 opções e 5 tipos de item calculada corretamente.

### Fase 17 — Propostas
- **Objetivo:** proposta comercial visual com link público rastreável.
- **Tarefas:** migration 0026; geração a partir de opções; snapshot versionado; página `/proposal/[token]` premium e responsiva (logo, cliente, destino, datas, passageiros, itens, investimento, pagamento, validade, observações); token seguro; tracking de views; máquina de estados; aceitar/pedir ajuste; envio via WhatsApp (template fora da janela).
- **Dependências:** Fases 15 e 16.
- **Testes:** token não enumerável; snapshot sem custo/margem; transições inválidas rejeitadas; view do próprio consultor não conta.
- **Critério:** cliente abre a proposta sem login; status e contadores corretos; eventos emitidos.

### Fase 18 — PDF
- **Objetivo:** PDF profissional da proposta.
- **Tarefas:** `@react-pdf/renderer` sobre o snapshot; bucket privado (migration 0027); envio como documento no WhatsApp.
- **Dependências:** Fase 17.
- **Testes:** PDF gerado para propostas com 1 e 3 opções; tamanho adequado ao WhatsApp.
- **Critério:** PDF baixável e enviável, visualmente consistente com a página.

### Fase 19 — Follow-up
- **Objetivo:** acompanhamento automático inteligente.
- **Tarefas:** migration 0028; regras padrão (`proposal.sent` +24h, `proposal.viewed` sem resposta +4h, `customer.inactive`); cancelamento por `customer.replied`; reavaliação antes do envio; horário comercial; templates; `next_followup_at` no card.
- **Dependências:** Fases 10, 15, 17.
- **Testes:** follow-up cancelado quando cliente responde; skip fora de condição; sem duplicidade.
- **Critério:** fluxo proposta → silêncio → follow-up → resposta cancela os pendentes.

### Fase 20 — Reservas
- **Objetivo:** proposta aceita vira reserva.
- **Tarefas:** migration 0029; booking a partir da opção aceita; booking_items com localizadores; código sequencial por agência; status; etapa do deal via automação.
- **Dependências:** Fase 17.
- **Testes:** aceite cria exatamente um booking; valores copiados do snapshot.
- **Critério:** reserva visível no deal, no cliente e na lista de reservas.

### Fase 21 — Pagamentos internos
- **Objetivo:** controle manual de recebimentos.
- **Tarefas:** migration 0030; registrar pagamento/reembolso (método, parcelas, vencimento); status agregado PENDENTE/PARCIAL/PAGO/REEMBOLSADO; `PaymentGateway` interface + `NotConfigured`.
- **Dependências:** Fase 20.
- **Testes:** cálculo de status agregado; apenas financeiro/owner/manager registram.
- **Critério:** evento `payment.received` dispara automações.

### Fase 22 — Agenda e tarefas
- **Objetivo:** agenda interna unificada.
- **Tarefas:** migration 0031; view `agenda_items`; calendário (dia/semana/mês); UI completa de tarefas (minhas, equipe, atrasadas); notificações de atraso.
- **Dependências:** Fases 8, 19, 20.
- **Testes:** agenda agrega fontes sem duplicar; filtros por consultor.
- **Critério:** follow-ups, tarefas, viagens e vencimentos de proposta aparecem na agenda.

### Fase 23 — Automações
- **Objetivo:** construtor TRIGGER → CONDITION → ACTION.
- **Tarefas:** migration 0032; UI de construção; validação Zod de condições/ações; histórico de execuções; proteção contra loops; automações padrão editáveis.
- **Dependências:** Fases 10, 19.
- **Testes:** idempotência por evento; loop impedido; ações com permissão verificada.
- **Critério:** agência cria automação "proposta visualizada → notificar consultor + tarefa" e ela executa.

### Fase 24 — Pré-viagem
- **Objetivo:** lembretes e checklists antes da viagem.
- **Tarefas:** migration 0033; job diário `trip_reminder`; D-7/D-1 configuráveis; checklist e informações importantes; card "Próximas viagens" no dashboard.
- **Dependências:** Fases 20, 23.
- **Testes:** fuso da agência; não enviar para reservas canceladas.
- **Critério:** lembrete enviado (template) no dia correto.

### Fase 25 — Pós-venda
- **Objetivo:** relacionamento após o retorno.
- **Tarefas:** job `post_trip`; pesquisa de satisfação, pedido de avaliação/indicação, nova viagem; opt-in de marketing respeitado.
- **Dependências:** Fase 24.
- **Testes:** respeito a consentimento; resposta do cliente vira conversa/deal novo quando for nova viagem.
- **Critério:** fluxo D+2 do retorno funcional.

### Fase 26 — Analytics e relatórios
- **Objetivo:** relatórios de turismo.
- **Tarefas:** migration 0034; relatórios de leads, cotações, propostas, reservas, vendas, conversão, ticket médio, destinos, consultores, origem, tempo de atendimento, performance IA × humana; funil por período; KPIs finais do dashboard.
- **Dependências:** fases anteriores.
- **Testes:** números conferidos contra dados de seed controlados; simulações excluídas.
- **Critério:** todos os KPIs do §8 do briefing com dados reais.

### Fase 27 — Super Admin
- **Objetivo:** gestão da plataforma.
- **Tarefas:** migration 0035; `/admin` com agências, usuários, assinaturas, mensagens, consumo IA, WhatsApp, erros/dead-letter; ativar/suspender agência; sessão de suporte auditada; MFA obrigatório.
- **Dependências:** Fases 3, 10, 11.
- **Testes:** não-admin bloqueado; suspensão bloqueia agência e IA imediatamente.
- **Critério:** operação da plataforma sem acesso direto ao banco.

### Fase 28 — Planos e uso
- **Objetivo:** limites por plano (sem cobrança).
- **Tarefas:** migration 0036; TRIAL/STARTER/PRO/PREMIUM com limites (usuários, WhatsApps, agentes, mensagens IA, contatos, propostas, automações, armazenamento); verificação de limites no servidor; avisos 80/100%; tela de plano.
- **Dependências:** Fases 11, 27; valores de D20.
- **Testes:** limites aplicados em cada ponto de criação/consumo.
- **Critério:** agência no limite recebe bloqueio claro e a IA faz handoff.

### Fase 29 — Auditoria de segurança
- **Objetivo:** revisão completa antes de produção.
- **Tarefas:** migration 0037 (LGPD: consents, data_subject_requests, anonimização, retenção); revisão de todas as policies; red team de prompt injection; testes de IDOR; headers/CSP; `npm audit`; E2E dos fluxos críticos; revisão de logs (sem PII).
- **Dependências:** todas.
- **Testes:** relatório de auditoria com achados e correções.
- **Critério:** zero achados críticos/altos abertos.

### Fase 30 — Produção
- **Objetivo:** go-live.
- **Tarefas:** DEPLOYMENT.md; ambientes staging/prod; domínios; backups e PITR; monitoramento/alertas (erros, dead-letter, custo IA); runbooks (incidente, rotação de segredos); app Meta em modo Live; teto de gasto Anthropic.
- **Dependências:** Fase 29.
- **Testes:** smoke tests em staging; teste de restauração de backup.
- **Critério:** primeira agência piloto atendendo clientes reais.

---

## 7. Riscos

### Técnicos
| # | Risco | Impacto | Mitigação |
|---|---|---|---|
| T1 | Dependência de aprovações Meta (verificação, Tech Provider, templates, qualidade do número) | alto | começar verificação cedo; conexão manual no MVP; templates submetidos antes da fase 19 |
| T2 | Custo de IA por conversa acima do esperado | alto | medir no simulador (fase 14), cache, contexto curto, effort ajustável, limites por plano |
| T3 | Envio duplicado no WhatsApp (API sem idempotência) | médio | estados `sending/sent`, janela mínima, dedupe por `messages.id` |
| T4 | Transações multi-tabela | médio | RPCs Postgres para operações críticas |
| T5 | Worker como componente extra | médio | health check, restart automático, alerta de fila parada |
| T6 | Extração com linguagem informal/datas ambíguas | médio | conjunto de avaliação pt-BR, validação, perguntas de confirmação |
| T7 | Áudio sem transcrição | médio | política configurável; avaliar STT |
| T8 | Supabase local no Windows exige Docker | baixo | projeto de dev na nuvem como alternativa |
| T9 | Realtime em escala (muitas conversas abertas) | baixo | assinaturas por conversa aberta, paginação |
| T10 | Crescimento do escopo (30 fases) | alto | MVP vendável ao final da fase 17–19; fases posteriores incrementais |

### Segurança
Ver SECURITY.md §13 (S1–S12): vazamento entre tenants por RLS, uso indevido do service role, prompt injection comercial, webhook forjado, vazamento de tokens, enumeração de propostas, denial of wallet, dados sensíveis ao modelo, acesso de super admin, XSS, envio para cliente errado, supply chain.

---

## 8. Marco de MVP sugerido
Fases **1 → 17** entregam o ciclo **WhatsApp → IA qualifica → CRM → cotação → proposta com link**, suficiente para uma agência piloto. Fases 18–30 ampliam automação, pós-venda, analytics e operação.

---

## 9. Acompanhamento
| Fase | Status | Data | Observações |
|---|---|---|---|
| 0 | ✅ concluída | 2026-09-22 | documentos de arquitetura |
| 1 | ✅ concluída | 2026-09-23 | Next.js 16 + Supabase + shadcn/ui (Base UI), tema claro/escuro, lint/typecheck/test/build |
| 2 | ✅ concluída | 2026-09-23 | cadastro com confirmação de e-mail, login, logout, `proxy.ts` protegendo rotas |
| 3 | ✅ concluída | 2026-09-23 | migrations 0001–0006, RLS forçada, RBAC, auditoria; 20/20 testes de isolamento (PGlite) |
| 4 | ✅ concluída | 2026-09-23 | etapas 1–4: dados da agência (CNPJ validado, site, Instagram), upload de logo (bucket público, escrita restrita por RLS, tipo validado por assinatura do arquivo), especialidades, horários com fuso; equipe com convite por link (token 256 bits, só o hash no banco, 7 dias, uso único, vinculado ao e-mail), troca de perfil/desativação auditadas, proteção do último dono; progresso de onboarding no dashboard. Etapas 5–8 liberam nas fases de IA/WhatsApp |
| 5 | 🟡 parcial | 2026-09-23 | sidebar, header, páginas estruturadas dos módulos, dashboard com KPIs reais disponíveis |
| 6 | 🟡 parcial | 2026-09-23 | CRUD de clientes (busca, paginação, arquivar/restaurar). Pendentes: tags, notas, preferências, viajantes |
| 7 | ✅ concluída | 2026-09-23 | migrations 0007–0008: pipeline de 13 etapas (semeado por agência), deals, histórico de etapas, solicitações 1:1 com deal, RPC `create_travel_request`; checklist determinístico de completude; avanço automático para “Solicitação completa”; telas de lista, criação e edição; 34/34 testes de banco no Supabase real |
| 8 | 🟡 quase concluída | 2026-09-23 | Kanban com arrastar e soltar (mouse, toque, teclado) + menu “Mover para”; cards com cliente, destino, datas, passageiros, orçamento, consultor e temperatura; lead score por regras (destino 10, datas 10, passageiros 10, orçamento 15, completa 15; regras de cotação/proposta/intenção entram nas fases 13/16/17); temperatura pelas faixas da agência; personalização de etapas (renomear, cor, ordem, criar/remover próprias). Pendentes: pesos do score configuráveis por agência, Realtime no quadro, tabela de tarefas |
| 9–30 | ⏳ não iniciada | — | IA (11–14) e WhatsApp (15) aguardam decisão de modelo e credenciais |

### Decisões registradas
- D1 `agency_id` ✅ · D5 Vercel ✅ · D6 Supabase na nuvem (sem Docker agora) ✅ · D13 dependências: vitest, libphonenumber-js, @electric-sql/pglite (dev, testes de RLS) ✅
- D2/D3 modelo de IA: **em aberto** — a camada `src/server/integrations` é independente de modelo.

### Pendências
- ⚠️ **Confirmação de e-mail desligada** no Supabase (a pedido, para testes). Antes de agências reais: configurar SMTP próprio (ex.: Resend) e religar *Confirm email* — o SMTP padrão do Supabase limita a 2 e-mails/hora.
- Viajantes nominais (`travelers`) ficam para a fase de reservas; a solicitação guarda a composição declarada (adultos, idades das crianças, bebês).

### Pendências de verificação
- ✅ 2026-09-23: migrations 0001–0006 aplicadas no Supabase real (`db push`) e 20/20 testes de isolamento executados no banco real com rollback forçado (sem dados residuais). `supabase test db` exige Docker; sem ele, os testes rodam via `supabase db query --linked`.
- Security advisor do Supabase: `create_agency_with_owner` executável por `authenticated` é intencional (RPC do onboarding). `public.rls_auto_enable()` vem do template do projeto Supabase (não é nossa); retorna `event_trigger`, então não pode ser chamada via RPC.
- O fluxo autenticado (dashboard, CRUD) ainda não foi exercitado ponta a ponta contra um Supabase real.
