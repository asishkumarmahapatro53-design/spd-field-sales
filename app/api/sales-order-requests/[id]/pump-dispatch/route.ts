import { jsonError, jsonOk, requireApiUser } from "@/lib/api";
import { updateSalesOrderPumpDispatch } from "@/lib/repository";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(["MANAGER"]);
    const body = (await request.json()) as {
      pumpDispatched?: boolean;
      pumpVehicleNumber?: string;
      pumpOperatorName?: string;
      pumpOperatorPhone?: string;
      note?: string;
    };
    const { id } = await context.params;
    const orderRequest = await updateSalesOrderPumpDispatch(user, id, {
      pumpDispatched: Boolean(body.pumpDispatched),
      pumpVehicleNumber: `${body.pumpVehicleNumber ?? ""}`,
      pumpOperatorName: `${body.pumpOperatorName ?? ""}`,
      pumpOperatorPhone: `${body.pumpOperatorPhone ?? ""}`,
      note: `${body.note ?? ""}`,
    });

    return jsonOk({ orderRequest });
  } catch (error) {
    return jsonError(error);
  }
}
