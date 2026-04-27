import { requireApiUser } from "@/lib/api";
import { readDatabase } from "@/lib/db";
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

    // Load agent's live context to build the system prompt
    const db = await readDatabase();

    const leads = db.leads.filter((l) => l.agentId === user.id);
    const leadSites = db.leadSites.filter((ls) =>
      leads.some((l) => l.id === ls.leadId),
    );
    const salesOrders = db.salesOrderRequests
      .filter((o) => o.createdBy === user.id)
      .slice(-10) // Last 10 for context window efficiency
      .map((o) => ({
        id: o.id,
        siteName: o.siteName,
        grade: o.grade,
        quantity: o.quantity,
        status: o.status,
      }));
    const tasks = db.tasks
      .filter((t) => t.assignedTo === user.id && t.status === "OPEN")
      .map((t) => ({ subject: t.subject, deadline: t.deadline }));

    const ctx: AgentContext = {
      agentName: user.name,
      employeeId: user.employeeId,
      plantId: user.homePlantId ?? "",
      leadNames: leads.map((l) => l.siteName),
      siteNames: leadSites.map((ls) => ls.siteName),
      pendingOrders: salesOrders,
      openTasks: tasks,
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
