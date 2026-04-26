import { randomUUID } from "node:crypto";
import { jsonError, jsonOk, requireApiUser, requireNumber } from "@/lib/api";
import { nowIso } from "@/lib/date";
import { readDatabase, updateDatabase } from "@/lib/db";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["BATCHER", "MANAGER"]);
    const { id: dispatchId } = await context.params;
    const body = await request.json();

    const returnedQuantityCum = requireNumber(body.returnedQuantityCum, "Returned quantity is required");

    if (returnedQuantityCum <= 0) {
      throw new Error("Returned quantity must be greater than zero.");
    }

    await updateDatabase((draft) => {
      const record = draft.dispatchRecords?.find((d) => d.id === dispatchId);
      if (!record) throw new Error("Dispatch record not found.");
      if (record.plantId !== user.homePlantId) throw new Error("Unauthorized access to this record.");
      
      if (record.status !== "DISPATCHED" && record.status !== "RETURNED") {
        throw new Error(`Cannot process return load for a record with status: ${record.status}`);
      }

      if (returnedQuantityCum > record.dispatchedQuantityCum) {
        throw new Error("Returned quantity cannot exceed dispatched quantity.");
      }

      const activeMixDesign = draft.mixDesigns?.find((m) => {
        const order = draft.salesOrderRequests.find((o) => o.id === record.orderId);
        return m.plantId === record.plantId && m.grade === order?.grade && m.isActive;
      });

      if (!activeMixDesign) throw new Error(`Could not find active Mix Design to calculate theoretical reduction.`);

      // Apply return
      record.returnedQuantityCum = returnedQuantityCum;
      record.finalSuppliedCum = record.dispatchedQuantityCum - returnedQuantityCum;
      record.status = "RETURNED";

      // Re-calculate theoretical values
      record.theoreticalCementKg = (activeMixDesign.cementKgPerCum * record.finalSuppliedCum);
      record.theoreticalGgbsKg = (activeMixDesign.ggbsKgPerCum * record.finalSuppliedCum);
      record.theoreticalFlyAshKg = (activeMixDesign.flyAshKgPerCum * record.finalSuppliedCum);
      record.theoreticalSandKg = (activeMixDesign.sandKgPerCum * record.finalSuppliedCum);
      record.theoreticalAggregate10mmKg = (activeMixDesign.aggregate10mmKgPerCum * record.finalSuppliedCum);
      record.theoreticalAggregate20mmKg = (activeMixDesign.aggregate20mmKgPerCum * record.finalSuppliedCum);
      record.theoreticalAdmixtureKg = (activeMixDesign.admixtureKgPerCum * record.finalSuppliedCum);
      record.theoreticalWaterLitres = (activeMixDesign.waterLitresPerCum * record.finalSuppliedCum);

      // Make truck IDLE again
      const vehicle = draft.fleetVehicles.find((v) => v.id === record.vehicleId);
      if (vehicle) {
        vehicle.status = "IDLE";
      }

      // Add the returned amount back to the order's remaining quantity
      const order = draft.salesOrderRequests.find((o) => o.id === record.orderId);
      if (order) {
        order.remainingQuantity += returnedQuantityCum;
      }

      // Audit Log
      draft.auditLogs.unshift({
        id: randomUUID(),
        actorId: user.id,
        actorRole: user.role,
        entityType: "DISPATCH_RECORD",
        entityId: record.id,
        action: "RETURN_LOAD",
        detail: `Logged return load of ${returnedQuantityCum} CUM for vehicle ${record.vehicleCode}. Final supplied: ${record.finalSuppliedCum} CUM.`,
        createdAt: nowIso(),
      });
    });

    return jsonOk({ message: "Return load processed successfully." });
  } catch (error) {
    return jsonError(error);
  }
}
