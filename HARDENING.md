# Production Hardening Guide

This document defines recommended production hardening defaults for AbacusWeb backend.

## 1) Recommended Production Values

## Rate Limit (Auth Endpoints)

- AUTH_RATE_LIMIT_WINDOW: `15m`
- AUTH_RATE_LIMIT_MAX: `10` requests per IP per window
- Strict mode (high-risk deployments): `5` requests / `15m`
- Balanced mode (larger user base): `20` requests / `15m`

Current code uses:
- `AUTH_RATE_LIMIT_WINDOW_MS` (milliseconds)
- `AUTH_RATE_LIMIT_MAX`

Recommended mapping:
- `AUTH_RATE_LIMIT_WINDOW=15m` -> `AUTH_RATE_LIMIT_WINDOW_MS=900000`

## Request Body Limit

- BODY_LIMIT: `1mb` (API default recommendation)
- If uploads are required later, keep API body small and move files to object storage

Current code variable:
- `REQUEST_BODY_LIMIT`

Recommended mapping:
- `BODY_LIMIT=1mb` -> `REQUEST_BODY_LIMIT=1mb`

## Express trust proxy

- TRUST_PROXY: `1` behind one reverse proxy/load balancer
- TRUST_PROXY: `2` if two trusted hops
- TRUST_PROXY: `true` only when all upstream proxies are trusted and controlled
- Never use `true` on unknown/open proxy chains

Recommendation for typical setup:
- `TRUST_PROXY=1`

## JWT + Refresh Token Lifetimes

- Access token expiry: `15m` to `20m` (recommended: `15m`)
- Refresh token lifetime: `7d` (recommended baseline)
- High-security profile: access `10m`, refresh `3d`
- Low-friction profile: access `20m`, refresh `14d` (only with stronger monitoring)

Current code variables:
- `JWT_ACCESS_EXPIRES_IN`
- `JWT_REFRESH_EXPIRES_IN`

Recommended values:
- `JWT_ACCESS_EXPIRES_IN=15m`
- `JWT_REFRESH_EXPIRES_IN=7d`

## 2) Reverse Proxy Configuration Notes

## Nginx

- Forward real client IP and protocol:
  - `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`
  - `proxy_set_header X-Forwarded-Proto $scheme;`
  - `proxy_set_header X-Forwarded-Host $host;`
- Enforce HTTPS redirect at edge
- Set request size limit aligned with API:
  - `client_max_body_size 1m;`
- Apply connection/timeouts to mitigate slowloris

## IIS (ARR / Reverse Proxy)

- Enable and preserve `X-Forwarded-For` and `X-Forwarded-Proto`
- Enforce HTTPS rewrite rule (HTTP -> HTTPS)
- Set request filtering max body size close to API body limit
- Enable dynamic IP restrictions / request throttling where possible

## GoDaddy Apache (shared hosting/reverse proxy scenarios)

- Ensure `X-Forwarded-For` and `X-Forwarded-Proto` are forwarded
- Force HTTPS via rewrite rules in virtual host or `.htaccess`
- Set request body cap using:
  - `LimitRequestBody 1048576`
- Keep Apache and SSL/TLS config managed by hosting provider up-to-date

## 3) Required Environment Variables Checklist

Use this checklist per environment (dev/stage/prod):

- `PORT`
- `DATABASE_URL`
- `JWT_ACCESS_SECRET` (strong random, at least 32 bytes)
- `JWT_REFRESH_SECRET` (strong random, at least 32 bytes, separate from access secret)
- `JWT_ACCESS_EXPIRES_IN`
- `JWT_REFRESH_EXPIRES_IN`
- `REQUEST_BODY_LIMIT`
- `AUTH_RATE_LIMIT_WINDOW_MS`
- `AUTH_RATE_LIMIT_MAX`

Recommended additional ops variables:
- `NODE_ENV=production`
- `TRUST_PROXY=1`
- `LOG_LEVEL=info`

## 4) Security Header Explanation

Helmet is enabled. Key headers and purpose:

- `X-Content-Type-Options: nosniff`
  - Prevents MIME-type sniffing attacks
- `X-Frame-Options` / `frame-ancestors` (via CSP)
  - Reduces clickjacking risk
- `Referrer-Policy`
  - Controls referrer leakage
- `Strict-Transport-Security` (when HTTPS is used)
  - Forces secure transport for subsequent requests
- `Cross-Origin-Resource-Policy`
  - Restricts resource loading across origins

Recommendation:
- Validate headers at reverse proxy and app layers
- Add CSP tuning if frontend domain list is known

## 5) Logging + Monitoring Recommendations

## Logging

- Keep structured JSON logs (already in place)
- Include: timestamp, level, request_id, user_id, tenant_id, route, status, duration
- Never log raw passwords, tokens, or full Authorization headers
- Redact sensitive fields (email optional masking, IP policy as per compliance)

## Monitoring

- Alerts for:
  - auth failure spikes
  - 429 spikes (rate-limit pressure)
  - 5xx error rate increases
  - DB latency and connection pool saturation
- Dashboard metrics:
  - request rate, p95/p99 latency
  - error rate by endpoint
  - login success/failure ratio
  - refresh token failure ratio

## Retention

- App logs: 30 to 90 days (based on policy)
- Audit logs: typically 90 to 365+ days (compliance dependent)

## 6) Backup & Database Maintenance Recommendations

## Backup Strategy

- Daily full backups + binlog/WAL-style incremental strategy where available
- Keep at least one off-site/cross-region copy
- Encrypt backups at rest and in transit
- Test restore monthly (non-negotiable)

## Maintenance

- Run regular index/statistics optimization
- Review slow query logs weekly
- Validate migration plans in staging before production
- Capacity planning:
  - storage growth
  - CPU/IO headroom
  - connection limits

## Integrity & Recovery

- Define RPO/RTO targets explicitly
- Maintain runbooks for:
  - point-in-time restore
  - failed migration rollback strategy
  - credential rotation

---

## Suggested Baseline (.env production profile)

- `JWT_ACCESS_EXPIRES_IN=15m`
- `JWT_REFRESH_EXPIRES_IN=7d`
- `REQUEST_BODY_LIMIT=1mb`
- `AUTH_RATE_LIMIT_WINDOW_MS=900000`
- `AUTH_RATE_LIMIT_MAX=10`
- `TRUST_PROXY=1`
