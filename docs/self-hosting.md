# Self-Hosting Guide

Deploy Vibe and Conquer on your own VPS with Docker, Caddy (automatic TLS), and a single `.env` file.

---

## Prerequisites

- A VPS running Linux
- A domain pointing to your VPS (A record → VPS IP)
- Ports **80** and **443** open in your firewall
- [Docker](https://docs.docker.com/engine/install/) + Docker Compose plugin installed

```bash
curl -fsSL https://get.docker.com | sh
```

---

## 1. Get the code

```bash
git clone https://github.com/svengraziani/vibe-and-conquer.git
cd vibe-and-conquer
```

---

## 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in at minimum:

```env
DOMAIN=yourdomain.com
GH_TOKEN=ghp_...
```

Full reference of all available variables is in `.env.example`.

---

## 3. Configure Caddy

Open `Caddyfile` — no changes needed unless you want to enable [Basic Auth](#optional-basic-auth).

---

## 4. Start

```bash
docker compose --profile prod up -d --build
```

Caddy will automatically obtain a Let's Encrypt TLS certificate for your domain on first start. This requires DNS to already be pointing at your VPS.

Check that everything is running:

```bash
docker compose ps
docker compose logs -f
```

---

## Updating

```bash
git pull
docker compose --profile prod up -d --build
```

Data volumes (`gh-ctrl-data`, `gh-ctrl-uploads`, `caddy-data`) are never touched during updates.

---

## Optional: Basic Auth

Protect the dashboard with a username and password via Caddy's built-in basic auth.

**1. Generate a bcrypt password hash:**

```bash
docker run --rm caddy:2-alpine caddy hash-password --plaintext 'yourpassword'
# outputs: $2a$14$abc123...
```

**2. Add credentials to `.env`:**

```env
BASIC_AUTH_USER=admin
BASIC_AUTH_HASH=$2a$14$abc123...
```

**3. Uncomment the `basicauth` block in `Caddyfile`:**

```
basicauth {
    {env.BASIC_AUTH_USER} {env.BASIC_AUTH_HASH}
}
```

**4. Reload Caddy:**

```bash
docker compose --profile prod exec caddy caddy reload --config /etc/caddy/Caddyfile
```

---

## Optional: Keycloak Auth

For SSO via Keycloak (OpenID Connect), set all six vars in `.env` before building:

```env
# Backend — JWT validation
KEYCLOAK_URL=https://keycloak.example.com
KEYCLOAK_REALM=myrealm
KEYCLOAK_CLIENT_ID=vibe-and-conquer

# Frontend — baked into the JS bundle at build time
VITE_KEYCLOAK_URL=https://keycloak.example.com
VITE_KEYCLOAK_REALM=myrealm
VITE_KEYCLOAK_CLIENT_ID=vibe-and-conquer
```

Then rebuild:

```bash
docker compose --profile prod up -d --build
```

> The `VITE_*` vars must be set before building — Vite bakes them into the JS bundle at build time, not at runtime.

---

## Local Development (without Docker)

```bash
cd gh-ctrl
cp .env.example .env   # fill in GH_TOKEN at minimum
bun install
cd client && bun install && cd ..
bun run dev
```

Frontend: http://localhost:5173  
Backend: http://localhost:3001

Or with Docker:

```bash
docker compose --profile dev up
```

---

## Persistent Data

| Volume | Contents |
|---|---|
| `gh-ctrl-data` | SQLite database |
| `gh-ctrl-uploads` | Badge images |
| `caddy-data` | TLS certificates |

To back up your data:

```bash
docker run --rm -v gh-ctrl-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/gh-ctrl-data-backup.tar.gz -C /data .
```
