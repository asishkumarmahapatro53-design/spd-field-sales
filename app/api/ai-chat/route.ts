import { requireApiUser } from "@/lib/api";
import { readCollection, readCollectionByFieldValues } from "@/lib/db";
import { callGeminiChat, type AgentContext, type ChatMessage } from "@/lib/ai-assistant";
import { jsonError, jsonOk } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(["SALES_AGENT", "MANAGER", "ACCOUNTING"]);
    const body = (await request.json()) as {
      history?: ChatMessage[];
      message?: string;
    };

    const userMessage = body.message?.trim();
    if (!userMessage) {
      return jsonError(new Error("Message is required."));
    }

    // Load only this agent's live context to avoid burning Firestore reads on unrelated records.
    const [leads, salesOrderRequests, tasks] = await Promise.all([
      readCollection("leads", { filters: [{ field: "agentId", op: "==", value: user.id }] }),
      readCollection("salesOrderRequests", { filters: [{ field: "createdBy", op: "==", value: user.id }] }),
      readCollection("tasks", { filters: [{ field: "assignedTo", op: "==", value: user.id }] }),
    ]);
    const leadSites = await readCollectionByFieldValues(
      "leadSites",
      "leadId",
      leads.map((lead) => lead.id),
    );
    const salesOrders = salesOrderRequests
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 10)
      .map((o) => ({
        id: o.id,
        siteName: o.siteName,
        grade: o.grade,
        quantity: o.quantity,
        status: o.status,
      }));
    const openTasks = tasks
      .filter((t) => t.assignedTo === user.id && t.status === "OPEN")
      .map((t) => ({ subject: t.subject, deadline: t.deadline }));

    const ctx: AgentContext = {
      agentName: user.name,
      employeeId: user.employeeId,
      plantId: user.homePlantId ?? "",
      leadNames: leads.map((l) => l.siteName),
      siteNames: leadSites.map((ls) => ls.siteName),
      pendingOrders: salesOrders,
      openTasks,
    };

    // Build full history including the new user message
    const previousHistory: ChatMessage[] = Array.isArray(body.history) ? body.history : [];
    const fullHistory: ChatMessage[] = [
      ...previousHistory,
      { role: "user", text: userMessage },
    ];

    try {
      const result = await callGeminiChat(fullHistory, ctx);
      return jsonOk({
        reply: result.text,
        actionBlock: result.actionBlock,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown Gemini error.";
      console.error("SPD Assistant failed:", reason);
      return jsonOk({
        reply: `SPD Assistant is unavailable right now. ${reason}`,
        actionBlock: null,
      });
    }
  } catch (error) {
    return jsonError(error);
  }
}
