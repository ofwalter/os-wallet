import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <LoginForm next={typeof next === "string" ? next : "/"} />
    </main>
  );
}
