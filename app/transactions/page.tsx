import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

const rows = [
  ["REF_123456", "John Doe", "₦120,000", "Failed"],
  ["REF_123455", "Sarah Johnson", "₦25,000", "Successful"],
  ["REF_123454", "Michael Brown", "₦75,000", "Failed"],
  ["REF_123453", "Aisha Bello", "₦40,000", "Successful"],
  ["REF_123452", "David Wilson", "₦120,000", "Failed"],
];

export default function TransactionsPage() {
  return <div className="flex min-h-screen"><Sidebar /><div className="flex-1"><Topbar /><main className="p-5 md:p-8"><h1 className="text-2xl font-bold">Transactions</h1><p className="mt-1 text-sm text-gray-500">View all transactions and recovery opportunities.</p><div className="mt-7 rounded-2xl border bg-white shadow-sm overflow-hidden"><div className="p-5 border-b flex justify-between"><span className="font-semibold">All transactions</span><button className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white">Sync transactions</button></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-500"><tr>{["Reference","Customer","Amount","Status"].map(x=><th key={x} className="text-left px-5 py-3 font-medium">{x}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r[0]} className="border-t"><td className="px-5 py-4">{r[0]}</td><td className="px-5 py-4">{r[1]}</td><td className="px-5 py-4 font-medium">{r[2]}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs ${r[3] === "Failed" ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}>{r[3]}</span></td></tr>)}</tbody></table></div></div></main></div></div>;
}
