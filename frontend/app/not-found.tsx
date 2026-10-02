export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#09090b] px-6 text-center text-white">
      <div>
        <p className="text-sm text-lime-300">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
        <a className="mt-5 inline-block text-sm text-zinc-400 underline" href="/">
          Return home
        </a>
      </div>
    </main>
  );
}
