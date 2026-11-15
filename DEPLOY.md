# Deploy: dino.umarbek.dev

## Run

```sh

docker compose up -d --build            # http://localhost:8290
docker compose --profile tunnel up -d   # + Cloudflare tunnel
```

Needs in `.env` next to `docker-compose.yml` (git-ignored):

| Variable | For |
|---|---|
| `NVIDIA_API_KEY` | the dino's chat (Nemotron) |
| `TUNNEL_TOKEN` | the Cloudflare tunnel (Zero Trust → Tunnels → token) |
| `TRUST_ADMIN_TOKEN` | optional: turns on "Add repository" / "Review", callers must send it |

In the tunnel's public hostname settings: `dino.umarbek.dev` → `http://app:8290`.

## What is public

Read-only by default: projects, reviews, tests, the chat, decisions and merges. Adding a repository
clones it and runs its tests on the server, so it is off unless `TRUST_ADMIN_TOKEN` is set. Do not
hand that token out: reviewed code runs with the container's rights (no sandbox yet).

Decisions and saved tests live in Docker volumes (`state`, `suite`) and survive restarts.
Reviews in `dossier/` are baked into the image; rebuild after `python3 -m core.dossier <case>`.
