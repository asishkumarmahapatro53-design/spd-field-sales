import { randomUUID } from "node:crypto";
import { jsonError, jsonOk, requireApiUser, requireNumber } from "@/lib/api";
import { nowIso } from "@/lib/date";
import { updateDatabase } from "@/lib/db";

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
      
      if (record.status !== "DISPATCHED") {
        throw new Error(`Cannot process return load for a record with status: ${record.status}`);
      }

      if (record.returnedQuantityCum > 0) {
        throw new Error("A return has already been processed for this dispatch.");
      }

      if (returnedQuantityCum > record.dispatchedQuantityCum) {
        throw new Error("Returned quantity cannot exceed dispatched quantity.");
      }

      const order = draft.salesOrderRequests.find((o) => o.id === record.orderId);
      if (!order) {
        throw new Error("Linked sales order could not be found.");
      }

      // Apply return
      record.returnedQuantityCum = returnedQuantityCum;
      record.finalSuppliedCum = record.dispatchedQuantityCum - returnedQuantityCum;
      record.status = "RETURNED";

      // Make truck IDLE again
      const vehicle = draft.fleetVehicles.find((v) => v.id === record.vehicleId);
      if (vehicle) {
        vehicle.status = "IDLE";
      }

      // Add the returned amount back to the order's remaining quantity
      order.remainingQuantity += returnedQuantityCum;
      order.fulfillmentStatus =
        order.remainingQuantity <= 0
          ? "FULLY_FULFILLED"
          : order.remainingQuantity < (order.orderQuantity ?? order.quantity)
            ? "PARTIALLY_FULFILLED"
            : "OPEN";

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
