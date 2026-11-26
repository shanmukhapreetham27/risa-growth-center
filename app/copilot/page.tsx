import { CopilotChat } from "@/components/copilot/copilot-chat";
import { PageTitle } from "@/components/kpi";
import { getDataset } from "@/lib/server/data";

/** Full page view of the copilot (SPEC §4); same conversation as the side panel. */
export default async function CopilotPage() {
  const data = await getDataset();
  return (
    <>
      <PageTitle title="Copilot" asOf={data.settings.simulation_date} />
      <div className="flex flex-col rounded-xl ring-1 ring-foreground/10" data-testid="copilot-page">
        <CopilotChat full />
      </div>
    </>
  );
}
