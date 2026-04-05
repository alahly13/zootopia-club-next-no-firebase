import { timingSafeEqual } from "node:crypto";

import { apiError, apiSuccess } from "@/lib/server/api";
import { sweepExpiredUploadedSources } from "@/lib/server/repository";

export const runtime = "nodejs";

function getMaintenanceSecret() {
  const value = process.env.ZOOTOPIA_MAINTENANCE_SECRET;
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function hasMatchingMaintenanceSecret(inputToken: string, configuredSecret: string) {
  const tokenBuffer = Buffer.from(inputToken);
  const secretBuffer = Buffer.from(configuredSecret);

  if (tokenBuffer.length !== secretBuffer.length) {
    return false;
  }

  /* This route is security-gated by a bearer secret. Preserve a timing-safe comparison so
     secret validation does not leak prefix-match timing signals under repeated probing. */
  return timingSafeEqual(tokenBuffer, secretBuffer);
}

function isAuthorizedMaintenanceRequest(request: Request) {
  const configuredSecret = getMaintenanceSecret();
  if (!configuredSecret) {
    return false;
  }

  const bearerToken = getBearerToken(request);
  return Boolean(
    bearerToken &&
      hasMatchingMaintenanceSecret(bearerToken, configuredSecret),
  );
}

export async function POST(request: Request) {
  /* This endpoint exists for scheduler-driven cleanup in production-scale deployments where
     temporary uploads must be removed even without new user traffic. Keep it server-only and
     secret-gated; never expose it to browser clients or unauthenticated route flows. */
  if (!isAuthorizedMaintenanceRequest(request)) {
    return apiError("MAINTENANCE_UNAUTHORIZED", "Maintenance authorization is required.", 401);
  }

  const result = await sweepExpiredUploadedSources({ force: true });

  return apiSuccess({
    runAt: result.runAt,
    scannedCount: result.scannedCount,
    deletedCount: result.deletedCount,
    forced: result.forced,
  });
}