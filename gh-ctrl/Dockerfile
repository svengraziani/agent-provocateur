# ── Stage 1: builder ─────────────────────────────────────────────────────────
FROM oven/bun AS builder

WORKDIR /app

# Install backend deps
COPY package.json bun.lock ./
RUN bun install

# Install frontend deps
COPY client/package.json client/bun.lock ./client/
RUN cd client && bun install

# Copy source and build frontend
COPY . .
RUN cd client && bunx vite build

# ── Stage 2: runtime (production) ────────────────────────────────────────────
FROM oven/bun AS runtime

# Install gh CLI
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg && \
    mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | gpg --dearmor -o /etc/apt/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends gh && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Pre-create data dir with correct ownership
RUN mkdir -p /app/data

# Copy only what production needs
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/client/dist ./client/dist

EXPOSE 3001

CMD ["bun", "src/index.ts"]

# ── Stage 3: dev ──────────────────────────────────────────────────────────────
FROM oven/bun AS dev

# Install gh CLI (same as runtime)
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg && \
    mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | gpg --dearmor -o /etc/apt/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends gh && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Pre-create data dir with correct ownership
RUN mkdir -p /app/data

# Install deps into the image so the anonymous node_modules volumes are
# populated from the image on first start, preventing host node_modules
# (wrong OS/arch) from being used when the source bind mount overlays /app.
COPY package.json bun.lock ./
RUN bun install
COPY client/package.json client/bun.lock ./client/
RUN cd client && bun install

EXPOSE 3001 5173

CMD ["bun", "run", "dev"]
