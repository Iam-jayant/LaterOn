import algosdk from "algosdk";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { UnauthorizedError, ValidationError } from "../errors";
import { nowUnix } from "../lib/time";
import type { AuthChallenge, InMemoryStore, SessionTokenPayload } from "./store";

export interface AuthTokenResult {
  token: string;
  expiresAtUnix: number;
}

const encodeBase64Url = (value: string): string => Buffer.from(value, "utf8").toString("base64url");

const decodeBase64Url = (value: string): string => Buffer.from(value, "base64url").toString("utf8");

const isHexSignature = (value: string): boolean => /^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0;

const parseSignature = (value: string): Uint8Array => {
  try {
    const bytes = isHexSignature(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
    return new Uint8Array(bytes);
  } catch {
    throw new ValidationError("Invalid signature format");
  }
};

const signPayload = (payloadEncoded: string, secret: string): string => {
  return createHmac("sha256", secret).update(payloadEncoded).digest("base64url");
};

export class AuthService {
  public constructor(private readonly store: InMemoryStore) {}

  public createChallenge(walletAddress: string, ttlSeconds: number): AuthChallenge {
    const issuedAt = nowUnix();
    const expiresAt = issuedAt + ttlSeconds;
    const challengeId = `challenge_${randomUUID()}`;
    const message = [
      "LaterOn wallet authentication",
      `wallet:${walletAddress}`,
      `nonce:${challengeId}`,
      `issued_at:${issuedAt}`,
      `expires_at:${expiresAt}`
    ].join("\n");

    const challenge: AuthChallenge = {
      challengeId,
      walletAddress,
      message,
      expiresAtUnix: expiresAt,
      consumed: false
    };
    this.store.authChallenges.set(challengeId, challenge);
    this.cleanupExpiredChallenges();
    return challenge;
  }

  public verifyChallengeAndIssueToken(params: {
    walletAddress: string;
    challengeId: string;
    signature: string;
    secret: string;
    tokenTtlSeconds: number;
    allowDevBypass: boolean;
  }): AuthTokenResult {
    const challenge = this.store.authChallenges.get(params.challengeId);
    if (!challenge) {
      throw new UnauthorizedError("Challenge not found");
    }
    if (challenge.walletAddress !== params.walletAddress) {
      throw new UnauthorizedError("Wallet mismatch for challenge");
    }
    if (challenge.consumed) {
      throw new UnauthorizedError("Challenge already used");
    }
    if (challenge.expiresAtUnix < nowUnix()) {
      throw new UnauthorizedError("Challenge expired");
    }

    const verified = this.verifySignature({
      challenge,
      signature: params.signature,
      allowDevBypass: params.allowDevBypass
    });
    if (!verified) {
      throw new UnauthorizedError("Signature verification failed");
    }

    challenge.consumed = true;
    this.store.authChallenges.set(challenge.challengeId, challenge);

    const issuedAt = nowUnix();
    const expiresAt = issuedAt + params.tokenTtlSeconds;
    const payload: SessionTokenPayload = {
      walletAddress: params.walletAddress,
      iat: issuedAt,
      exp: expiresAt
    };
    const payloadEncoded = encodeBase64Url(JSON.stringify(payload));
    const signature = signPayload(payloadEncoded, params.secret);
    return {
      token: `${payloadEncoded}.${signature}`,
      expiresAtUnix: expiresAt
    };
  }

  public verifyToken(token: string, secret: string): SessionTokenPayload {
    const [payloadEncoded, signature] = token.split(".");
    if (!payloadEncoded || !signature) {
      throw new UnauthorizedError("Invalid auth token");
    }

    const expected = signPayload(payloadEncoded, secret);
    const incoming = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (incoming.length !== expectedBuffer.length || !timingSafeEqual(incoming, expectedBuffer)) {
      throw new UnauthorizedError("Invalid auth token signature");
    }

    let payload: SessionTokenPayload;
    try {
      payload = JSON.parse(decodeBase64Url(payloadEncoded)) as SessionTokenPayload;
    } catch {
      throw new UnauthorizedError("Invalid auth token payload");
    }

    if (!payload.walletAddress || typeof payload.exp !== "number" || typeof payload.iat !== "number") {
      throw new UnauthorizedError("Invalid auth token payload");
    }
    if (payload.exp < nowUnix()) {
      throw new UnauthorizedError("Auth token expired");
    }

    return payload;
  }

  private verifySignature(params: {
    challenge: AuthChallenge;
    signature: string;
    allowDevBypass: boolean;
  }): boolean {
    if (params.allowDevBypass && params.signature === `DEV:${params.challenge.challengeId}`) {
      return true;
    }

    const signatureBytes = parseSignature(params.signature);
    const messageBytes = new TextEncoder().encode(params.challenge.message);
    return algosdk.verifyBytes(messageBytes, signatureBytes, params.challenge.walletAddress);
  }

  private cleanupExpiredChallenges(): void {
    const unix = nowUnix();
    for (const [challengeId, challenge] of this.store.authChallenges.entries()) {
      if (challenge.expiresAtUnix < unix || challenge.consumed) {
        this.store.authChallenges.delete(challengeId);
      }
    }
  }
}
