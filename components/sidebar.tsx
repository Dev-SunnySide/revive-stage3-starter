import Link from "next/link";
import { LayoutDashboard, ReceiptText, Target, Send, Users, BarChart3, Settings } from "lucide-react";

const items = [
  ["/dashboard", "Dashboard", LayoutDashboard],
  ["/transactions", "Transactions", ReceiptText],
  ["/opportunities", "Opportunities", Target],
  ["/recovery", "Recovery Actions", Send],
  ["/customers", "Customers", Users],
  ["/analytics", "Analytics", BarChart3],
  ["/settings", "Settings", Settings],
] as const;

export function Sidebar() {
  return (
    <aside className="hidden md:flex w-64 shrink-0 border-r bg-white min-h-screen flex-col">
      <div className="px-7 py-6 text-xl font-bold tracking-wide">R<span className="text-indigo-600">↗</span> REVIVE</div>
      <nav className="px-3 space-y-1">
        {items.map(([href, label, Icon]) => (
          <Link key={href} href={href} className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-gray-600 hover:bg-indigo-50 hover:text-indigo-700">
            <Icon size={18} /> {label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto border-t p-4">
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Merchant</p>
          <p className="mt-1 text-sm font-semibold">Demo Store</p>
        </div>
      </div>
    </aside>
  );
}
