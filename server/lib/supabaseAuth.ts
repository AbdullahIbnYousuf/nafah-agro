import { createRemoteJWKSet, JWTPayload, jwtVerify } from "jose";

export interface VerifiedSupabaseUser {
  id: string;
  email?: string;
  claims: JWTPayload;
}

export type SupabaseTokenVerifier = (
  token: string,
) => Promise<VerifiedSupabaseUser>;

export function createSupabaseTokenVerifier(
  supabaseUrl: string,
  audience = "authenticated",
): SupabaseTokenVerifier {
  const baseUrl = supabaseUrl.replace(/\/+$/, "");
  const issuer = `${baseUrl}/auth/v1`;
  const jwks = createRemoteJWKSet(
    new URL(`${issuer}/.well-known/jwks.json`),
  );

  return async (token: string) => {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience,
    });

    if (!payload.sub) {
      throw new Error("Supabase token does not contain a subject");
    }

    return {
      id: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      claims: payload,
    };
  };
}
