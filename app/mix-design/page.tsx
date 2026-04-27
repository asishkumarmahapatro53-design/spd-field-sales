import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { MixDesignMaster } from "@/components/manager/MixDesignMaster";
import { requireUser } from "@/lib/auth";
import { readDatabase } from "@/lib/db";

export default async function MixDesignPage() {
  const user = await requireUser("MIX_DESIGN");
  const database = await readDatabase();
  const activeMixDesigns = database.mixDesigns.filter((entry) => entry.isActive);
  const coveredGrades = new Set(activeMixDesigns.map((entry) => entry.grade));

  return (
    <AppShell
      user={user}
      title="Mix Design Dashboard"
      subtitle="Create and maintain active concrete recipes for every plant without entering the manager workspace."
      statusLabel="MIX_DESIGN_VIEW"
      compact
    >
      <section className="metric-grid mt-24">
        <MetricCard label="Plants" value={database.plants.length} note="Available for recipe setup" />
        <MetricCard label="Active recipes" value={activeMixDesigns.length} note="Latest active mix designs" />
        <MetricCard label="Grades covered" value={coveredGrades.size} note="Unique concrete grades configured" />
      </section>

      <section className="manager-section mt-24">
        <MixDesignMaster plants={database.plants} currentPlantId={database.plants[0]?.id} />
      </section>
    </AppShell>
  );
}
