"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "./utils/supabase/client";

const UFL_EMAIL_REGEX = /^[^\s@]+@ufl\.edu$/;

export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const validateEmail = (value: string) => {
    if (value && !UFL_EMAIL_REGEX.test(value)) {
      setEmailError("Email must end with @ufl.edu");
      return false;
    } else {
      setEmailError("");
      return true;
    }
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    validateEmail(value);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!validateEmail(email)) {
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="text-center mb-8">
        <h1 className="text-5xl font-bold text-white mb-2">UF Check-In</h1>
        <p className="text-white/90 text-lg">Powered by ACM</p>
      </div>
      <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 w-full max-w-md border border-white/20">
        <div className="text-center mb-8">
          <p className="text-white/80">Sign in or create an account</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-200 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={handleEmailChange}
              required
              className={`w-full bg-white/20 placeholder-white/70 text-white font-semibold py-3 px-4 rounded-lg focus:outline-none focus:ring-2 transition-all duration-200 backdrop-blur-sm border ${
                emailError
                  ? "border-red-500 focus:ring-red-500"
                  : "border-white/30 focus:ring-white/50"
              }`}
            />
            {emailError && (
              <p className="text-red-600 text-sm mt-2">{emailError}</p>
            )}
          </div>
          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-white/20 placeholder-white/70 text-white font-semibold py-3 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/50 transition-all duration-200 backdrop-blur-sm border border-white/30"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white/20 hover:bg-white/30 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 backdrop-blur-sm border border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing In..." : "Sign In"}
          </button>
        </form>

        <div className="mt-4">
          <button
            onClick={() => router.push("/signup")}
            className="w-full bg-[#FA4616] hover:bg-[#e03d0f] text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 shadow-lg"
          >
            Sign Up
          </button>
        </div>
      </div>
    </div>
  );
}
