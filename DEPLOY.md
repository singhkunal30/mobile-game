# Deploy

The server is a standard Node app behind a `Dockerfile`. Run it anywhere that runs containers. The fastest indie path is Fly.io — one command from a clean checkout.

## Fly.io (one-command deploy)

### Prereqs (5 min, once)

```bash
# 1. Install flyctl
curl -L https://fly.io/install.sh | sh
# (or: brew install flyctl)

# 2. Sign up / log in (free, no credit card for hobby tier)
flyctl auth signup     # or `flyctl auth login`
```

### Deploy

From the repo root:

```bash
npm run deploy:fly
# Optional: pass a custom app name
# npm run deploy:fly -- my-game-name
```

The script:
1. Creates the Fly app on first run (`blackout-protocol.fly.dev`)
2. Builds the server image remotely on Fly's builder (no local Docker needed)
3. Deploys to a 256 MB shared-CPU VM in your chosen region
4. Prints the public WSS URL

That's it. Server is live at `wss://blackout-protocol.fly.dev`.

### Use the deployed server in the mobile app

```bash
echo "VITE_SERVER_URL=wss://blackout-protocol.fly.dev" > client/.env.local
npm run build:client
cd client && npm run cap:sync   # then rebuild APK / IPA
```

Now the APK works from any network. No laptop needed.

### Updating

After code changes:
```bash
npm run deploy:fly   # ~60 second rebuild + zero-downtime swap
```

### Scaling

```bash
flyctl scale vm shared-cpu-2x --memory 1024    # bump to 1 GB / 2 vCPU
flyctl scale count 3 --region iad,fra,syd      # geo-distributed
flyctl logs                                     # tail server logs
flyctl status                                   # current VMs & health
```

For multi-region scaling you'll need `@colyseus/redis-presence` so all nodes share room state — see README "Scaling considerations".

### Cost

- Free tier: enough for testing and small launches
- 1 × shared-CPU-1x 256MB VM = ~$2/mo if you outgrow the free tier
- Past ~50 concurrent players you'll want to bump to shared-cpu-2x or split rooms across regions

## Other hosts

The `Dockerfile` works on any container platform — same image, same port (2567), same `/healthz` endpoint. Quick notes:

| Host | Notes |
| --- | --- |
| **Railway** | `railway up` from repo root. Set `PORT=2567`. WebSocket support automatic. |
| **Render** | New Web Service → Docker → set health check path to `/healthz`. Free tier cold-starts on idle (not great for multiplayer). |
| **DigitalOcean App Platform** | Dockerfile detected automatically. ~$5/mo for basic instance. |
| **GCP Cloud Run** | Enable HTTP/2 + WebSocket on the service. Autoscales to zero (cold start ~1s). |
| **AWS Fargate** | Push image to ECR, run behind ALB with target group sticky sessions. More setup, infinite ceiling. |
| **DIY VPS + Caddy** | 3-line Caddyfile auto-terminates TLS, proxies WS to `localhost:2567`. |

## Local deploy (single command, your machine)

```bash
docker compose up --build
# Server live at http://localhost:2567
```

Useful for LAN parties or self-hosting on a home server.

## Production checklist

- [ ] Server URL baked into the mobile build (`VITE_SERVER_URL=wss://...`)
- [ ] `NODE_ENV=production` (disables the `/monitor` debug endpoint)
- [ ] TLS / WSS — never ship `ws://` to a published app (iOS blocks it)
- [ ] At least one VM with `min_machines_running = 1` so the first player doesn't pay a cold start
- [ ] Telemetry endpoint set if you want client-side metrics (`VITE_TELEMETRY_URL`)
- [ ] Sentry / Datadog / Loki ingesting the server's JSON logs (one-line JSON per log, ready out of the box)
- [ ] Health-check alerting on `/healthz` returning non-200
