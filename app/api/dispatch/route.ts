import { randomUUID } from "node:crypto";
import { jsonError, jsonOk, requireApiUser, requireNumber, requireString } from "@/lib/api";
import { nowIso } from "@/lib/date";
import { readDatabase, updateDatabase } from "@/lib/db";
import type { DispatchRecord, DispatchStatus } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["BATCHER", "MANAGER"]);
    const body = await request.json();

    const orderId = requireString(body.orderId, "Order ID is required");
    const vehicleId = requireString(body.vehicleId, "Vehicle ID is required");
    const dispatchedQuantityCum = requireNumber(body.dispatchedQuantityCum, "Dispatch quantity is required");

    if (dispatchedQuantityCum <= 0) {
      throw new Error("Dispatch quantity must be greater than zero.");
    }

    const plantId = user.homePlantId;
    if (!plantId) throw new Error("User is not assigned to a plant.");

    let newRecord: DispatchRecord | null = null;

    // Atomic transaction simulation via updateDatabase lock
    await updateDatabase((draft) => {
      const order = draft.salesOrderRequests.find((o) => o.id === orderId);
      if (!order) throw new Error("Order not found.");
      if (order.homePlantId !== plantId) throw new Error("Order belongs to a different plant.");
      if (order.status !== "SCHEDULE_APPROVED") throw new Error("Order is not approved for dispatch.");

      if (dispatchedQuantityCum > order.remainingQuantity) {
        throw new Error(`Cannot dispatch ${dispatchedQuantityCum} CUM. Only ${order.remainingQuantity} CUM remaining.`);
      }

      const vehicle = draft.fleetVehicles.find((v) => v.id === vehicleId);
      if (!vehicle) throw new Error("Vehicle not found.");
      if (vehicle.status !== "IDLE") throw new Error("Vehicle is not IDLE.");

      const activeMixDesign = draft.mixDesigns?.find((m) => m.plantId === plantId && m.grade === order.grade && m.isActive);
      if (!activeMixDesign) throw new Error(`No active Mix Design found for grade ${order.grade} at this plant.`);

      // 1. Reduce remaining quantity
      order.remainingQuantity -= dispatchedQuantityCum;

      // 2. Change vehicle status
      vehicle.status = "ACTIVE";

      // 3. Create Dispatch Record with Theoretical Consumption
      newRecord = {
        id: randomUUID(),
        orderId: order.id,
        plantId,
        vehicleId: vehicle.id,
        vehicleCode: vehicle.vehicleRegistrationNumber,
        driverName: vehicle.assignedDriverName || "Unknown",
        dispatchedQuantityCum,
        returnedQuantityCum: 0,
        finalSuppliedCum: dispatchedQuantityCum,
        status: "DISPATCHED",
        dispatchedAt: nowIso(),
        siteAcceptedAt: null,
        siteRejectedAt: null,
        ewayBillNumber: null,
        ewayBillGeneratedAt: null,
        theoreticalCementKg: (activeMixDesign.cementKgPerCum * dispatchedQuantityCum),
        theoreticalGgbsKg: (activeMixDesign.ggbsKgPerCum * dispatchedQuantityCum),
        theoreticalFlyAshKg: (activeMixDesign.flyAshKgPerCum * dispatchedQuantityCum),
        theoreticalSandKg: (activeMixDesign.sandKgPerCum * dispatchedQuantityCum),
        theoreticalAggregate10mmKg: (activeMixDesign.aggregate10mmKgPerCum * dispatchedQuantityCum),
        theoreticalAggregate20mmKg: (activeMixDesign.aggregate20mmKgPerCum * dispatchedQuantityCum),
        theoreticalAdmixtureKg: (activeMixDesign.admixtureKgPerCum * dispatchedQuantityCum),
        theoreticalWaterLitres: (activeMixDesign.waterLitresPerCum * dispatchedQuantityCum),
        createdBy: user.id,
        createdAt: nowIso(),
      };

      if (!draft.dispatchRecords) draft.dispatchRecords = [];
      draft.dispatchRecords.push(newRecord);

      // Audit Log
      draft.auditLogs.unshift({
        id: randomUUID(),
        actorId: user.id,
        actorRole: user.role,
        entityType: "DISPATCH_RECORD",
        entityId: newRecord.id,
        action: "CREATED",
        detail: `Dispatched ${dispatchedQuantityCum} CUM to Order ${orderId.slice(0, 8)} using vehicle ${vehicle.vehicleRegistrationNumber}`,
        createdAt: nowIso(),
      });
    });

    return jsonOk({ dispatchRecord: newRecord }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
