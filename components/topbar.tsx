export function Topbar() {
  return (
    <header className="h-16 border-b bg-white flex items-center justify-between px-5 md:px-8">
      <div className="text-sm text-gray-500">Revenue Recovery Center</div>
      <div className="flex items-center gap-3">
        <div className="hidden sm:block rounded-full border px-3 py-2 text-xs text-gray-500">⌕ Search anything...</div>
        <div className="h-9 w-9 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-semibold text-indigo-700">D</div>
      </div>
    </header>
  );
}
