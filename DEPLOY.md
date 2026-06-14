# Desplegar Grexya en Vercel (gratis)

## 1. Sube el código a un repo (GitHub)
```bash
cd grexya-app
git add -A && git commit -m "Grexya MVP"
# crea el repo y haz push (gh repo create grexya-app --private --source=. --push)
```

## 2. Importa en Vercel
- vercel.com → Add New → Project → importa el repo `grexya-app`.
- Framework: **Next.js** (autodetectado). Build/Output por defecto.

## 3. Variables de entorno (Project Settings → Environment Variables)
Copia desde tu `.env.local` (las mismas claves):

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | pk_test_… |
| `CLERK_SECRET_KEY` | sk_test_… |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | /sign-in |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | /sign-up |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | /mando |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | /mando |
| `NEXT_PUBLIC_SUPABASE_URL` | https://bztkflxvriavjxsmtomy.supabase.co |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sb_publishable_… |
| `SUPABASE_SERVICE_ROLE_KEY` | sb_secret_… |
| `ANTHROPIC_API_KEY` | sk-ant-… (para el chat IA) |

## 4. Deploy
Vercel construye y despliega. Tu URL será `https://grexya-app.vercel.app`.

## 5. Apunta Clerk al dominio de producción
- Cuando uses Clerk en producción real, crea una **instancia de producción** en
  Clerk y reemplaza las claves `pk_live_…` / `sk_live_…` en Vercel.
- Para empezar, las claves de desarrollo (`pk_test`) funcionan también en Vercel.

## Alternativa: CLI
```bash
npm i -g vercel
vercel        # login + link (interactivo, córrelo tú con: ! vercel)
vercel --prod
```
> Recuerda configurar las variables de entorno antes del `--prod`.
