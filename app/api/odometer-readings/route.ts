import { ApiError, jsonError, jsonOk, parseLatLng, requireApiUser, requireString } from "@/lib/api";
import { createOdometerReading } from "@/lib/repository";
import type { ReadingType } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["SALES_AGENT"]);
    const formData = await request.formData();
    const type = requireString(formData.get("type"), "Reading type is required.") as ReadingType;
    const photo = formData.get("photo");

    if (!(photo instanceof File)) {
      throw new ApiError(400, "An odometer photo is required.");
    }

    const reading = await createOdometerReading(user, {
      type,
      file: photo,
      latLng: parseLatLng({
        lat: formData.get("lat"),
        lng: formData.get("lng"),
      }),
    });

    return jsonOk({ reading }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
