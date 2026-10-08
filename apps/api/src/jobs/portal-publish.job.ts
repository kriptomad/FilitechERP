// src/jobs/portal-publish.job.ts — Cap. 11.12 (OLX/Webmotors/iCarros)
import { prismaUnscoped } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

type Portal = "OLX" | "WEBMOTORS" | "ICARROS";

const PORTAL_ENDPOINTS: Record<Portal, string | null> = {
  OLX: process.env.OLX_API_URL ?? null,
  WEBMOTORS: process.env.WEBMOTORS_API_URL ?? null,
  ICARROS: process.env.ICARROS_API_URL ?? null,
};

/**
 * Publicação automática de anúncios (Cap. 11.12):
 * - status AVAILABLE → publica/atualiza em todos os portais;
 * - status SOLD → remove o anúncio em todos simultaneamente,
 *   eliminando o risco de vender um carro já reservado em outro canal.
 */
export async function publishVehicleListing(
  listingId: string,
  action: "PUBLISH" | "UPDATE" | "REMOVE",
) {
  const listing = await prismaUnscoped.vehicleListing.findUnique({
    where: { id: listingId },
  });
  if (!listing) throw new Error("LISTING_NOT_FOUND");

  const results: Record<string, "ok" | "failed" | "skipped"> = {};

  for (const [portal, endpoint] of Object.entries(PORTAL_ENDPOINTS)) {
    if (!endpoint) {
      results[portal] = "skipped";
      continue;
    }

    if (action === "REMOVE" || listing.status === "SOLD") {
      try {
        await callPortal(endpoint, "DELETE", {
          chassisNumber: listing.chassisNumber,
        });
        results[portal] = "ok";
      } catch (err) {
        logger.error({ err, portal, listingId }, "portal_remove_failed");
        results[portal] = "failed";
      }
      continue;
    }

    if (listing.status !== "AVAILABLE" && listing.status !== "CONSIGNED") {
      results[portal] = "skipped";
      continue;
    }

    try {
      await callPortal(endpoint, action === "PUBLISH" ? "POST" : "PUT", {
        chassisNumber: listing.chassisNumber,
        licensePlate: listing.licensePlate,
        model: listing.model,
        manufactureYear: listing.manufactureYear,
        mileageKm: listing.mileageKm,
        askingPrice: Number(listing.askingPrice),
      });
      results[portal] = "ok";
    } catch (err) {
      logger.error({ err, portal, listingId }, "portal_publish_failed");
      results[portal] = "failed";
    }
  }

  logger.info({ listingId, action, results }, "vehicle_portal_sync_completed");
  return results;
}

async function callPortal(
  endpoint: string,
  method: string,
  body: Record<string, unknown>,
) {
  const res = await fetch(endpoint, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.PORTAL_API_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Portal ${method} ${endpoint} → ${res.status}`);
  }
}

export function registerPortalPublishWorker() {
  return {
    name: "vehicle-portal-publish",
    handler: async (job?: { data: { listingId: string; action: "PUBLISH" | "UPDATE" | "REMOVE" } }) => {
      if (!job?.data?.listingId) return { skipped: true };
      return publishVehicleListing(job.data.listingId, job.data.action);
    },
  };
}
