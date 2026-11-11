import { FileText } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { EmptyState } from "@/components/EmptyState";

export default function ReportsPage() {
  return (
    <div>
      <Topbar title="Reports" breadcrumb={[{ label: "Reports" }]} />
      <EmptyState
        icon={<FileText className="h-6 w-6" />}
        title="Reports are coming soon"
        description="Generated spill reports and PDF export will appear here."
      />
    </div>
  );
}