# Future Authentication & Authorization — Better Approach

> **Legacy design note:** this predates the agreed Supabase Auth V1 design.
> `docs/SYSTEM_DESIGN.md` is authoritative for implementation.

This document outlines improvements to evolve the current simple JWT-based auth into a production-grade, scalable system.

---

## Current Approach (Simple JWT)

**What we have now:**

- `bcryptjs` password hashing + `jsonwebtoken` for stateless bearer tokens
- 3 roles: `admin`, `moderator`, `customer`
- Unlock code for admin registration
- Tokens stored in `localStorage`, sent via `Authorization: Bearer <token>` header
- 7-day token expiry, no refresh mechanism

**Limitations:**

- No token revocation (you can't "log out" a compromised token before expiry)
- No refresh tokens (user must re-login after 7 days)
- `localStorage` is vulnerable to XSS attacks
- No rate limiting on login endpoint (brute-force risk)
- No audit logging of auth events
- Single JWT secret (no key rotation)
- LLM moderator agent uses the same token as human moderators

---

## Recommended Migration Path

### Phase 1: Essential Security Hardening

| Improvement                | Why                                                                                        | How                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| **Refresh token rotation** | Short-lived access tokens (15min) + long-lived refresh tokens reduce window of token theft | Access token in memory, refresh token in `httpOnly` cookie. `POST /auth/refresh` issues new pair.      |
| **HttpOnly cookies**       | Prevent XSS from stealing tokens                                                           | Set `httpOnly`, `secure`, `sameSite: strict` on refresh token cookie. Access token stays in JS memory. |
| **Rate limiting**          | Prevent brute-force login attacks                                                          | Use `express-rate-limit` — e.g., 5 failed logins per 15 min per IP.                                    |
| **Password requirements**  | Enforce minimum security                                                                   | Minimum 8 chars, at least 1 uppercase, 1 number. Use `zod` for validation.                             |
| **Audit logging**          | Track login attempts, role changes, suspicious activity                                    | Log auth events to a separate MongoDB collection or dedicated logging service.                         |

### Phase 2: LLM Agent Service Accounts

For the LLM moderator agent, create a separate auth mechanism:

| Improvement            | Why                                                              | How                                                                                              |
| ---------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **API keys**           | Long-lived, non-expiring credentials for machine-to-machine auth | Generate unique API key per agent. Store hashed in DB. Sent via `X-API-Key` header.              |
| **Scoped permissions** | LLM agent should only access specific endpoints                  | Define granular permission sets (e.g., `orders:create`, `products:read`) instead of broad roles. |
| **Request signing**    | Ensure requests haven't been tampered with                       | HMAC signature of request body + timestamp. Prevents replay attacks.                             |
| **Usage quotas**       | Prevent runaway LLM from making unlimited API calls              | Per-key rate limits + daily/monthly request caps.                                                |

**Recommended API key format:**

```bash
na_mod_<random_32_chars>
```

Where `na` = Nafah Agro, `mod` = moderator role prefix.

### Phase 3: OAuth 2.0 / OpenID Connect

If the platform grows to support third-party integrations or social login:

| Improvement            | Why                                             | How                                                              |
| ---------------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| **OAuth 2.0 provider** | Industry standard for delegated authorization   | Use `passport.js` with strategies for Google, Facebook, etc.     |
| **OpenID Connect**     | Standardized identity layer on top of OAuth 2.0 | Add OIDC-compliant ID tokens with user claims.                   |
| **PKCE flow**          | Secure auth for SPA/mobile clients              | Implement Authorization Code with PKCE instead of implicit flow. |

### Phase 4: Enterprise-Grade Scaling

| Improvement                 | Why                                                   | How                                                                                                                   |
| --------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Redis session store**     | Fast token blacklisting + session management          | Use Redis for refresh token storage + revocation list. Enables instant logout.                                        |
| **Key rotation**            | If JWT signing key is compromised, limit blast radius | Rotate keys periodically. Use JWKS endpoint. Support multiple valid keys during rotation.                             |
| **Multi-tenant auth**       | If serving multiple stores/brands                     | Tenant ID in JWT claims. Namespace all data access by tenant.                                                         |
| **RBAC → ABAC**             | Fine-grained access beyond simple roles               | Attribute-Based Access Control — decisions based on user attributes, resource attributes, and environment conditions. |
| **Auth service extraction** | Decouple auth from main API                           | Separate microservice (or use Auth0/Clerk/Firebase Auth) for auth, keeping the main API focused on business logic.    |

---

## Recommended Tech Stack for Production

| Component          | Current              | Recommended                                                  |
| ------------------ | -------------------- | ------------------------------------------------------------ |
| Password hashing   | `bcryptjs`           | `argon2` (winner of Password Hashing Competition)            |
| Token management   | `jsonwebtoken`       | `jose` (modern, supports key rotation)                       |
| Session storage    | None (stateless JWT) | Redis (`ioredis`)                                            |
| Rate limiting      | None                 | `express-rate-limit` + Redis store                           |
| Auth provider      | Custom               | Consider Auth0, Clerk, or Firebase Auth for managed solution |
| API key management | N/A                  | Custom with hashed storage, or use Kong/Tyk API gateway      |

---

## Migration Priority

1. **Immediate** — Add rate limiting to login endpoint
2. **Short-term** — Implement refresh token rotation + httpOnly cookies
3. **Medium-term** — Create API key system for LLM agent
4. **Long-term** — Evaluate managed auth providers (Auth0/Clerk) vs. self-hosted
