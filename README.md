# Rumo — SaaS de IA para agências de viagens

Plataforma multi-tenant para agências de viagens: atendimento com IA no WhatsApp, CRM de turismo,
cotações, propostas, reservas e automações. "Rumo" é um nome de trabalho (`src/config/app.ts`).

> Planejamento completo: [PROJECT_PLAN.md](PROJECT_PLAN.md) · [ARCHITECTURE.md](ARCHITECTURE.md) ·
> [DATABASE.md](DATABASE.md) · [SECURITY.md](SECURITY.md) · [ENVIRONMENT.md](ENVIRONMENT.md)

## Stack
Next.js 16 (App Router, Turbopack) · React 19 · TypeScript strict · Tailwind CSS 4 · shadcn/ui (Base UI) ·
Lucide · Supabase (Postgres, Auth, RLS) · Zod · Vitest. Hospedagem: Vercel.

## O que já existe
- Layout do painel: sidebar com todos os módulos, header com busca, notificações, tema claro/escuro e troca de agência
- Autenticação (cadastro com confirmação de e-mail, login, logout) e proteção de rotas
- Multi-tenant: agências, membros, perfis (dono, gerente, consultor, atendente, financeiro), RLS e auditoria
- Onboarding: criação atômica da agência (etapa 1; demais etapas bloqueadas até suas fases)
- **CRUD de clientes**: lista com busca e paginação, cadastro, edição, arquivar/restaurar
- Páginas estruturadas de todos os módulos futuros (sem dados fictícios)
- Contratos para integrações futuras em `src/server/integrations` (IA independente de modelo, WhatsApp, voos, hotéis, pagamentos)

## Rodando localmente
```bash
npm install
cp .env.example .env.local   # preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY
npx supabase link --project-ref <ref-do-projeto>
npm run db:push              # aplica supabase/migrations no projeto
npm run dev
```
Sem as variáveis do Supabase, o app mostra a tela `/setup` com as instruções — nada é simulado.

## Verificação
| Comando | O que faz |
|---|---|
| `npm run lint` | ESLint (sem `any`, sem HTML bruto, UI não importa código de servidor) |
| `npm run typecheck` | tipos de rotas + `tsc --noEmit` |
| `npm test` | testes unitários (Vitest) |
| `npm run db:test:local` | aplica as migrations num Postgres embutido (PGlite) e roda os testes de RLS — sem Docker |
| `npm run db:test` | testes pgTAP no Supabase real (`supabase test db`) |
| `npm run build` | build de produção |
| `npm run check` | todos acima, em sequência (exceto `db:test`) |

## Deploy na Vercel
1. Importe o repositório na Vercel (framework detectado: Next.js).
2. Em *Settings → Environment Variables*, defina `NEXT_PUBLIC_APP_URL` (URL do deploy), `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. No Supabase, em *Authentication → URL Configuration*, use a URL da Vercel como Site URL e adicione `https://<dominio>/auth/callback` nas Redirect URLs.
4. Confirmação de e-mail: *Authentication → Providers → Email → Confirm email* ligado.

## Estrutura
```
src/app/(auth)        login e cadastro
src/app/(app)         painel autenticado (sidebar + header)
src/app/onboarding    criação da agência
src/modules/<módulo>  schemas (Zod), repository, actions, components
src/server            auth/tenant, db (Supabase), integrations (contratos)
supabase/migrations   schema, RLS, funções
supabase/tests        testes de isolamento entre agências
```
