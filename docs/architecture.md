# Architecture — Private Network Service Platform (Phase 1)

![Topology](topology.png)

## 1. Overview

A fully local service network built on two MacBooks connected to the same Wi-Fi hotspot.
A client types `https://app.team1.test`, the name is resolved by **our own DNS server**, the
connection is secured with **a certificate signed by our own CA**, and **nginx** load-balances
the request across **two backend servers**. No cloud services or pre-configured servers are used.

## 2. Machines, roles and ports

| Machine | Role | Services | Port / protocol | DNS setting |
|---|---|---|---|---|
| **Mac 1** | Client | Browser, `curl`, `dig`, `nslookup`, Wireshark | — | Mac 2's Wi-Fi IP |
| **Mac 2** | Server | dnsmasq (private DNS) | 53 / UDP | `127.0.0.1` |
| | | nginx — HTTPS edge, TLS termination, load balancer | 443 / TCP | |
| | | nginx — HTTP → HTTPS redirect | 80 / TCP | |
| | | Backend A (Node.js / Express) | 4000 / TCP (loopback) | |
| | | Backend B (Node.js / Express) | 6000 / TCP (loopback) | |

Both Macs receive their IP addresses from the hotspot via DHCP and share the same subnet mask
and default gateway (see `evidence/phase1/A-network/`). Because the hotspot can hand out a new
address after reconnecting, the DNS records and Mac 1's DNS setting are updated to Mac 2's
current IP at the start of each session.

### Why all server roles are on Mac 2

The original plan placed DNS and nginx on the other laptop. During setup, dnsmasq on that Mac
answered queries on `127.0.0.1` but **timed out on its own Wi-Fi IP**, even when queried from
the same machine. We diagnosed this layer by layer:

| Test | Result | Conclusion |
|---|---|---|
| `ping` between the Macs | ✅ works | IP connectivity is fine |
| `lsof -iUDP:53` | dnsmasq listening on the Wi-Fi IP | Server is configured correctly |
| `tcpdump -i en0 udp port 53` | Query **arrives**, no reply leaves | Packet is dropped on the host |
| `dig @127.0.0.1` vs `dig @<Wi-Fi IP>` | Works vs times out | Loopback is not filtered; the LAN interface is |
| `systemextensionsctl list`, `profiles status` | College proxy extension, MDM-managed Mac | Managed firewall policy blocks incoming connections |
| `socketfilterfw --setglobalstate off` | "cannot be modified … on managed Mac computers" | Policy cannot be changed by the user |

The managed Mac therefore became the **client** (outgoing traffic is unaffected), and the
unmanaged Mac hosts DNS, nginx and both backends.

## 3. Request flow (mapped to layers)

| Step | What happens | Protocol / port | OSI layer | TCP/IP layer |
|---|---|---|---|---|
| 1 | Mac 1 asks dnsmasq for `app.team1.test`; dnsmasq answers with Mac 2's IP (TTL 30 s) | DNS over UDP 53 | 7 Application (UDP at 4) | Application |
| 2 | TCP three-way handshake (SYN → SYN-ACK → ACK) from an ephemeral client port to 443 | TCP 443 | 4 Transport | Transport |
| 3 | TLS handshake; server presents the certificate for `app.team1.test`, signed by *Team1 Local CA*, which Mac 1 trusts | TLS 1.2 / 1.3 | 5–6 Session / Presentation | (between Application and Transport) |
| 4 | Encrypted HTTP request sent to nginx | HTTP inside TLS | 7 Application | Application |
| 5 | nginx decrypts, picks a backend (round-robin) and forwards **plain HTTP** over loopback | HTTP to 127.0.0.1:4000 / :6000 | 7 Application | Application |
| 6 | Backend replies; nginx encrypts the response back to Mac 1 | HTTPS | 7 Application | Application |

Underneath every step: IP addressing and routing on the LAN (Network layer) and Wi-Fi frames
between the Macs and the hotspot (Data-link / Physical).

## 4. Components

### 4.1 Private DNS — dnsmasq (`configs/dnsmasq/dnsmasq.conf`)
- `address=/app.team1.test/<Mac 2 IP>` and `address=/api.team1.test/<Mac 2 IP>` — private A records.
- `local=/team1.test/` — the zone is answered locally and never forwarded.
- `server=8.8.8.8`, `server=1.1.1.1` — every other name is forwarded, so normal browsing still works.
- `listen-address=127.0.0.1,<Mac 2 IP>` + `bind-interfaces` — answers on loopback and the LAN only.
- `local-ttl=30` — short TTL, so record changes propagate within 30 seconds.
- `log-queries` — the query log proves which client asked.
- `.test` is a reserved top-level domain (RFC 2606 / RFC 6761), so it can never clash with a public name; public resolvers return **NXDOMAIN** for it.

### 4.2 Backends — Node.js / Express (`backendA/`, `backendB/`)
- `GET /` → `hello from backend A` / `hello from backend B` (identifies which server answered).
- `GET /api/data` → identical JSON on both backends with `Cache-Control: max-age=60`; Express adds an `ETag` and answers `304 Not Modified` to a matching `If-None-Match`.
- Identical content on both backends means identical ETags, so revalidation works no matter which backend round-robin picks.

### 4.3 Edge — nginx (`configs/nginx/team1.conf`)
- `upstream team1_backends` with `127.0.0.1:4000` and `127.0.0.1:6000` — default **round-robin**.
- `max_fails=1 fail_timeout=10s` + `proxy_next_upstream error timeout http_502 http_503` — **passive health checking**: a failed request is retried on the other backend and the failed one is skipped for 10 s.
- `listen 443 ssl` with our certificate and key; `ssl_protocols TLSv1.2 TLSv1.3`.
- Port 80 returns `301` to `https://$host$request_uri`.
- `location = /favicon.ico { return 204; }` — browsers request a favicon on every page load; without this, the page and favicon requests always split A/B and the page itself appeared to come only from Backend A.
- The client only ever learns Mac 2's IP from DNS; backend addresses are known only to nginx.

### 4.4 TLS — local Certificate Authority (`certs/`)
1. Create a CA key and self-signed CA certificate (*Team1 Local CA*, `CA:TRUE`).
2. Create a server key and CSR for `app.team1.test`.
3. Sign the CSR with the CA, adding `subjectAltName=DNS:app.team1.test,DNS:api.team1.test` (`san.ext`) — browsers validate the SAN, not the CN.
4. Install `ca.crt` as a trusted root on the client; the certificate then verifies without warnings and without `curl -k`.

Only public files (`ca.crt`, `app.team1.test.crt`, `san.ext`) are committed; private keys are excluded by `.gitignore`.
TLS terminates at nginx: traffic is encrypted on the network and plain HTTP only inside Mac 2 (see `G-internal-plaintext`).

### 4.5 Caching
| Case | What the browser does | Seen as |
|---|---|---|
| Fresh hit | Response younger than `max-age=60`; served from cache, **no request sent** | `(memory cache)` / `(disk cache)` |
| Revalidation | Stale copy; sends `If-None-Match: <ETag>`; server confirms unchanged | `304 Not Modified`, headers only |
| Full fetch | Hard reload bypasses the cache | `200 OK` with body |

## 5. Failure demonstrations (summary)

| # | Fault injected | Symptom | Failing layer |
|---|---|---|---|
| 1 | Client DNS set to 8.8.8.8 | `NXDOMAIN`; IP connectivity still works | DNS (application) |
| 2 | Wrong A record for `app.team1.test` | Resolves, but TCP connection times out | DNS data → wrong host |
| 3 | Backend B stopped | All responses from A; no errors | Upstream — handled by failover |
| 4 | Both backends stopped | DNS, TCP and TLS succeed; nginx returns `502 Bad Gateway` | Upstream (application) |
| 5 | Wrong port (8443) | `Connection refused` (TCP RST) | Transport |

Details and screenshots: `evidence/phase1/failures/`.

## 6. Known limitations (addressed in Phase 2)
- **Single point of failure:** Mac 2 runs DNS, the edge and both backends; if it goes down, everything stops.
- **No backup DNS:** clients have only one resolver.
- **Passive health checks only:** a backend is marked down only after a real request fails.
- **Dynamic IPs:** the hotspot may assign new addresses, requiring the DNS records to be updated.
