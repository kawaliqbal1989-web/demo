import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const jwtCommonOptions = {
  algorithm: "HS256",
  issuer: env.jwtIssuer,
  audience: env.jwtAudience
};

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function signAccessToken(payload) {
  return jwt.sign(payload, env.jwtAccessSecret, {
    ...jwtCommonOptions,
    expiresIn: env.jwtAccessExpiresIn
  });
}

function signRefreshToken(payload) {
  const tokenId = crypto.randomUUID();
  const token = jwt.sign(
    {
      ...payload,
      tokenId,
      tokenType: "refresh"
    },
    env.jwtRefreshSecret,
    {
      ...jwtCommonOptions,
      expiresIn: env.jwtRefreshExpiresIn
    }
  );

  const decoded = jwt.decode(token);
  const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : null;

  return {
    token,
    tokenId,
    expiresAt
  };
}

function verifyAccessToken(token) {
  const decoded = jwt.verify(token, env.jwtAccessSecret, {
    ...jwtCommonOptions,
    algorithms: ["HS256"],
    ignoreExpiration: false
  });

  if (decoded?.tokenType === "refresh") {
    const error = new Error("Invalid token type for access token");
    error.statusCode = 401;
    error.errorCode = "INVALID_ACCESS_TOKEN";
    throw error;
  }

  return decoded;
}

function verifyRefreshToken(token) {
  const decoded = jwt.verify(token, env.jwtRefreshSecret, {
    ...jwtCommonOptions,
    algorithms: ["HS256"],
    ignoreExpiration: false
  });

  if (decoded?.tokenType !== "refresh" || !decoded?.tokenId) {
    const error = new Error("Invalid refresh token payload");
    error.statusCode = 401;
    error.errorCode = "INVALID_REFRESH_TOKEN";
    throw error;
  }

  return decoded;
}

export {
  tokenHash,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
};
