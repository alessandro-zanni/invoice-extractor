"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signIn(_: string | undefined, form: FormData) {
  const supabase = await createClient();
  const email = form.get("email");
  const password = form.get("password");
  if (typeof email !== "string" || typeof password !== "string") return "Wrong email or password.";
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return "Wrong email or password.";
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
