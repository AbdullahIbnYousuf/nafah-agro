# Authentication Design Note

This file previously described the retired custom JWT and moderator design. It
is kept only so old links do not break.

The current implementation uses:

- Supabase Auth for login, logout, registration, refresh, and browser sessions.
- PostgreSQL `profiles` as the only role source.
- `OWNER` and `CUSTOMER` roles, with multiple controlled OWNER profiles.
- Express verification of Supabase access tokens followed by active-profile and
  role checks.
- A controlled CLI workflow for the first owner; no public privileged signup.

See `docs/SYSTEM_DESIGN.md`, `README.md`, and `API.md` for the authoritative
design and operational instructions.
