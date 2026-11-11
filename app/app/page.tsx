import { Topbar } from "@/components/Topbar";

export default function Home() {
  return (
    <div>
      <Topbar title="Dashboard" breadcrumb={[{ label: "Dashboard" }]} />
      <p className="text-muted">Dashboard content is built in a later step.</p>
    </div>
  );
}