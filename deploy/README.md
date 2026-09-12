# Reverse-proxy configs

Tick's production server (port 3000 by default) speaks plain HTTP. Put nginx or Caddy in front of it for TLS, compression and security headers. Both examples assume Tick on `127.0.0.1:3000` — adjust if yours differs.

## nginx — `nginx.conf.example`

```sh
sudo cp nginx.conf.example /etc/nginx/conf.d/tick.conf
# edit: server_name, and uncomment ONE ssl_certificate pair (certbot or internal CA)
sudo nginx -t && sudo systemctl reload nginx
```

Two variants inside the file:

- **Variant A (default): public host with TLS.** Port 80 redirects to 443. Certs via certbot (`certbot --nginx -d tick.example.com` also works and writes the lines for you) or your internal CA.
- **Variant B (commented): internal host, plain HTTP.** For a LAN-only box — comment out variant A, uncomment variant B.

Enable the HSTS header only after TLS works; browsers cache it and a bad cert then locks users out for the max-age.

## Caddy — `Caddyfile.example`

```sh
sudo cp Caddyfile.example /etc/caddy/Caddyfile   # edit the site address
sudo systemctl reload caddy
```

Public hostnames get automatic Let's Encrypt certificates. For an internal box, uncomment `tls internal` (Caddy's built-in CA — trust its root cert on your devices) or change the site address to `http://tick.internal.lan` for plain HTTP.

## Both configs already handle

- `X-Forwarded-*`/`Host` headers so Tick sees real client IPs and the right origin (session cookies work through the proxy)
- 8 MB request bodies for CSV import
- No-cache headers on `sw.js` + `manifest.webmanifest` so PWA installs update promptly
- gzip, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'self'`
- WebSocket upgrades (future-proofing — Tick needs none today)
