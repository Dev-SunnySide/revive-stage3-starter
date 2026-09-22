import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

export default function SettingsPage() {
  return <div className="flex min-h-screen"><Sidebar /><div className="flex-1"><Topbar /><main className="p-5 md:p-8 max-w-4xl"><h1 className="text-2xl font-bold">Settings</h1><p className="mt-1 text-sm text-gray-500">Manage your account and integrations.</p><div className="mt-7 rounded-2xl border bg-white p-6 shadow-sm"><h2 className="font-semibold">Paystack Integration</h2><p className="mt-2 text-sm text-gray-500">Connect your Paystack account so REVIVE can sync transactions and identify recovery opportunities.</p><div className="mt-6 rounded-xl border bg-gray-50 p-5"><div className="flex items-center justify-between"><div><p className="font-medium">Paystack</p><p className="text-xs text-gray-500 mt-1">Not connected</p></div><button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Connect Paystack</button></div></div></div></main></div></div>;
}
