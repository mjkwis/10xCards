import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard"];
const AUTH_ROUTES = ["/auth/signin", "/auth/signup"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  const pathname = context.url.pathname.replace(/\/+$/, "") || "/";

  if (pathname === "/") {
    return context.redirect(context.locals.user ? "/dashboard" : "/auth/signin");
  }

  if (AUTH_ROUTES.includes(pathname) && context.locals.user) {
    return context.redirect("/dashboard");
  }

  if (PROTECTED_ROUTES.some((route) => pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
