import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { Dashboard } from "@/components/dashboard";

export default function DashboardPage() {
  return <div className="flex min-h-screen"><Sidebar /><div className="flex-1"><Topbar /><main className="p-5 md:p-8 max-w-[1600px]"><Dashboard /></main></div></div>;
}
