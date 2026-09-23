# ENVIRONMENT.md — Variáveis de ambiente e credenciais

> Status: **Fase 0**. Nenhuma credencial real foi criada ou usada. Os valores ficam em `.env.local` (dev) e no painel do provedor de hospedagem (staging/prod). **Nunca versionar** `.env*` exceto `.env.example`.

---

## 1. Variáveis

| Variável | Escopo | Obrigatória a partir da fase | Descrição |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | público | 1 | URL base (`http://localhost:3000` em dev). Usada em links de proposta e redirects de auth |
| `NEXT_PUBLIC_SUPABASE_URL` | público | 1 | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | público | 1 | Chave pública (anon, ou a nova *publishable key* `sb_publishable_…`). Segura no browser **somente porque há RLS** |
| `SUPABASE_SERVICE_ROLE_KEY` | **servidor** | 10 | Chave de serviço (ou nova *secret key* `sb_secret_…`). Ignora RLS — usada só pela fila de jobs (e depois webhook/admin); o lint impede importá-la em outro lugar |
| `SUPABASE_DB_URL` | servidor/CLI | 1 (opcional) | String de conexão Postgres para `supabase db push`/testes; não usada pela app em runtime |
| `APP_ENCRYPTION_KEY` | **servidor** | 15 | 32 bytes em base64 para AES-256-GCM (tokens WhatsApp, credenciais de integrações) |
| `APP_ENCRYPTION_KEY_VERSION` | servidor | 15 | Versão da chave atual (rotação) — default `1` |
| `PROPOSAL_TOKEN_PEPPER` | **servidor** | 17 | Segredo (≥ 32 bytes) para HMAC dos tokens de proposta/convite |
| `IP_HASH_SALT` | **servidor** | 17 | Segredo para hash de IP (views, rate limit) |
| `ANTHROPIC_API_KEY` | **servidor** | 11 | Chave da API Claude |
| `ANTHROPIC_MODEL_AGENT` | servidor | 11 | Modelo do agente de conversa (proposto: `claude-opus-5`) |
| `ANTHROPIC_MODEL_AUX` | servidor | 11 | Modelo de tarefas auxiliares/resumos (proposto: `claude-opus-5`; aguardando sua decisão) |
| `ANTHROPIC_AGENT_EFFORT` | servidor | 11 | `low`/`medium`/`high` (proposto: `medium`) |
| `AI_MAX_TOOL_ITERATIONS` | servidor | 13 | default `5` |
| `META_APP_ID` | servidor | 15 | ID do App Meta da plataforma |
| `META_APP_SECRET` | **servidor** | 15 | Segredo do App — valida assinatura dos webhooks |
| `META_WHATSAPP_VERIFY_TOKEN` | **servidor** | 15 | String aleatória definida por você para a verificação do webhook |
| `META_GRAPH_API_VERSION` | servidor | 15 | ex.: `v23.0` (confirmar a versão vigente no momento da fase 15) |
| `META_WHATSAPP_ACCESS_TOKEN` | **servidor**, só dev | 15 | Token do número de **teste** para desenvolvimento. Em produção, tokens ficam por agência, criptografados no banco |
| `META_WHATSAPP_PHONE_NUMBER_ID` | servidor, só dev | 15 | Phone number ID do número de teste |
| `META_WHATSAPP_BUSINESS_ACCOUNT_ID` | servidor, só dev | 15 | WABA ID de teste |
| `CRON_SECRET` | **servidor** | 10 | Bearer exigido por `/api/internal/jobs` (chamado pelo Supabase Cron). Também guardado no Vault do Supabase como `cron_secret` |
| `LOG_LEVEL` | ambos | 1 | `debug`/`info`/`warn`/`error` |

`src/lib/env.ts` valida tudo com Zod no boot e falha com mensagem clara indicando a variável ausente e a fase que a exige.

---

## 2. Onde obter cada credencial

### 2.1 Supabase (fase 1)
- **URL:** https://supabase.com/dashboard → *New project* (região recomendada **South America (São Paulo)**).
- **Menu:** *Project Settings → API Keys* (e *Project Settings → Data API* para a URL).
  - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `anon` / *publishable key*
  - `SUPABASE_SERVICE_ROLE_KEY` = `service_role` / *secret key* (**nunca** no browser)
- **Menu:** *Project Settings → Database → Connection string* → `SUPABASE_DB_URL` (opcional).
- **Auth:** *Authentication → URL Configuration* → Site URL = `NEXT_PUBLIC_APP_URL`; Redirect URLs incluem `http://localhost:3000/**`.
- **Local (alternativa):** Supabase CLI + Docker Desktop: `npx supabase init` / `npx supabase start` imprime URL e chaves locais.
- **Como testar:** `curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"` deve responder 200; na fase 1 haverá `npm run check:env`.

### 2.2 Anthropic (fase 11)
- **URL:** https://console.anthropic.com → *Settings → API Keys* → *Create Key*. Crie uma chave por ambiente (dev/staging/prod) em workspaces separados para acompanhar custo.
- **Billing:** *Settings → Billing* (créditos/limites) e *Settings → Limits* (rate limits e limite de gasto mensal — **configure um teto**).
- Variável: `ANTHROPIC_API_KEY`.
- **Como testar:** o projeto terá `npm run check:anthropic` (uma chamada mínima registrando tokens). Manualmente:
  ```bash
  curl https://api.anthropic.com/v1/messages -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" -H "content-type: application/json" -d '{"model":"claude-opus-5","max_tokens":32,"messages":[{"role":"user","content":"ping"}]}'
  ```

### 2.3 Meta WhatsApp Cloud API (fase 15)
1. **Conta:** https://business.facebook.com — Business Manager da plataforma (verificação do negócio será necessária para produção e para ser Tech Provider).
2. **App:** https://developers.facebook.com/apps → *Create App* → tipo **Business** → adicionar produto **WhatsApp**.
3. **Credenciais de teste:** *WhatsApp → API Setup*:
   - *Temporary access token* (24h) → `META_WHATSAPP_ACCESS_TOKEN` (só dev)
   - *Phone number ID* → `META_WHATSAPP_PHONE_NUMBER_ID`
   - *WhatsApp Business Account ID* → `META_WHATSAPP_BUSINESS_ACCOUNT_ID`
   - Adicione seu celular como destinatário de teste.
4. **App ID / App Secret:** *App settings → Basic* → `META_APP_ID`, `META_APP_SECRET` (*Show*).
5. **Token permanente:** *Business Settings → Users → System users* → criar usuário de sistema (Admin) → *Add assets* (o app e a WABA) → *Generate token* com permissões `whatsapp_business_messaging` e `whatsapp_business_management`.
6. **Webhook:** *WhatsApp → Configuration → Webhook* → *Edit*:
   - Callback URL: `https://<seu-domínio-ou-túnel>/api/webhooks/whatsapp`
   - Verify token: o valor de `META_WHATSAPP_VERIFY_TOKEN` (gere com `openssl rand -hex 32`)
   - *Webhook fields* → assinar **`messages`**.
   - Em dev, exponha o localhost com um túnel HTTPS (ex.: `cloudflared tunnel --url http://localhost:3000` ou ngrok).
7. **Como testar:**
   - Verificação: `curl "http://localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=123"` → deve retornar `123`.
   - Envio: mandar mensagem do seu celular para o número de teste → ver linha em `messages` e resposta da IA.
   - Assinatura: teste automatizado com payload de fixture assinado com `META_APP_SECRET`.

### 2.4 Segredos gerados por você (sem provedor)
```bash
openssl rand -base64 32
```
Use um valor diferente para cada: `APP_ENCRYPTION_KEY`, `PROPOSAL_TOKEN_PEPPER`, `IP_HASH_SALT`, `CRON_SECRET`, `META_WHATSAPP_VERIFY_TOKEN` (este pode ser `openssl rand -hex 32`).

---

## 2.5 Fila de processamento (fase 10) — Supabase Cron + Vercel
O Supabase chama `POST /api/internal/jobs` a cada minuto (pg_cron + pg_net). A rota só aceita o segredo `CRON_SECRET`.

1. **Gere o segredo** no seu computador: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
2. **Vercel → Settings → Environment Variables** (tipo *Sensitive*, ambiente Production):
   - `CRON_SECRET` = o valor gerado
   - `SUPABASE_SERVICE_ROLE_KEY` = Supabase → *Project Settings → API Keys* → chave **secret / service_role**
   - Depois: *Deployments → ⋯ → Redeploy*.
3. **Supabase → SQL Editor** (guarda URL e segredo no Vault, fora do repositório):
   ```sql
   select vault.create_secret('https://SEU-DOMINIO/api/internal/jobs', 'jobs_endpoint');
   select vault.create_secret('O_MESMO_CRON_SECRET', 'cron_secret');
   ```
4. **Como testar:** `/api/health` deve mostrar `"jobsConfigured": true`; após 1–2 minutos, `select status_code from net._http_response order by created desc limit 5;` deve retornar `200`.
5. **Rotação:** gere outro segredo, atualize a Vercel (redeploy) e rode `select vault.update_secret((select id from vault.secrets where name = 'cron_secret'), 'NOVO');`.

## 3. Ambientes
| Ambiente | Supabase | Meta | Anthropic |
|---|---|---|---|
| local | CLI/Docker ou projeto `dev` | app de teste + número de teste | chave `dev` com teto baixo |
| staging | projeto `staging` | número de teste/secundário | chave `staging` |
| production | projeto `prod` (São Paulo) | app verificado, números das agências | chave `prod` com teto e alertas |

## 4. Rotação de segredos
- `APP_ENCRYPTION_KEY`: adicionar nova chave com `APP_ENCRYPTION_KEY_VERSION+1`, job de re-criptografia, remover antiga. (Na fase 15 o suporte a duas chaves simultâneas — `APP_ENCRYPTION_KEY_PREVIOUS` — será implementado.)
- `META_APP_SECRET`, `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: gerar nova no painel, atualizar no host, reiniciar web e worker, revogar a antiga.
- `PROPOSAL_TOKEN_PEPPER`: rotacionar invalida links de proposta existentes — só em incidente.

## 5. Arquivos
- `.env.example` — modelo versionado, sem valores.
- `.env.local` — dev (ignorado pelo git).
- `.gitignore` deve conter `.env*` com exceção `!.env.example`.
