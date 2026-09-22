import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-5xl grid md:grid-cols-2 overflow-hidden rounded-3xl border bg-white shadow-xl">
        <section className="bg-[#0d1747] text-white p-10 md:p-14">
          <div className="text-xl font-bold tracking-wide">R<span className="text-cyan-300">↗</span> REVIVE</div>
          <div className="mt-20 max-w-md">
            <p className="text-sm font-medium text-cyan-200">AI REVENUE RECOVERY</p>
            <h1 className="mt-3 text-4xl md:text-5xl font-bold leading-tight">Turn failed payments into recovered revenue.</h1>
            <p className="mt-5 text-white/70 leading-7">
              REVIVE finds high-probability lost-payment opportunities and helps businesses bring that revenue back.
            </p>
          </div>
        </section>
        <section className="p-10 md:p-14">
          <p className="text-sm text-gray-500">Merchant portal</p>
          <h2 className="mt-2 text-3xl font-bold">Welcome back</h2>
          <p className="mt-2 text-gray-500">Sign in to continue to your revenue recovery dashboard.</p>
          <div className="mt-8 space-y-4">
            <input className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-200" placeholder="Business email" />
            <input className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-200" placeholder="Password" type="password" />
            <Link href="/dashboard" className="block w-full rounded-xl bg-indigo-600 py-3.5 text-center font-semibold text-white hover:bg-indigo-700">
              Sign in
            </Link>
          </div>
          <p className="mt-6 text-center text-sm text-gray-500">Demo mode — no credentials required.</p>
        </section>
      </div>
    </main>
  );
}
