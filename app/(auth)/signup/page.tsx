"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import OTPModal from "../../components/OTPModal";

const UFL_EMAIL_REGEX = /^[^\s@]+@ufl\.edu$/;

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
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

  const validatePassword = (pass: string, confirmPass: string) => {
    if (pass.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      return false;
    }
    if (pass !== confirmPass) {
      setPasswordError("Passwords do not match");
      return false;
    }
    setPasswordError("");
    return true;
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    validateEmail(value);
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);
    if (confirmPassword) {
      validatePassword(value, confirmPassword);
    }
  };

  const handleConfirmPasswordChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value;
    setConfirmPassword(value);
    validatePassword(password, value);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password, confirmPassword);

    if (!isEmailValid || !isPasswordValid) {
      return;
    }

    setLoading(true);

    try {
      // sign up with otp
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (error) {
        setError(error.message);
      } else {
        // Show OTP modal
        setShowOTPModal(true);
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (code: string) => {
    setOtpError("");
    setOtpLoading(true);

    try {
      // otp verification
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "signup",
      });

      if (verifyError) {
        setOtpError(verifyError.message);
      } else {
        // success
        setShowOTPModal(false);
        router.push("/dashboard");
      }
    } catch (err) {
      setOtpError("An unexpected error occurred");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOTP = async () => {
    await supabase.auth.resend({
      type: "signup",
      email,
    });
  };

  const handleCloseModal = () => {
    setShowOTPModal(false);
    setOtpError("");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="text-center mb-8">
        <h1 className="text-5xl font-bold text-white mb-2">UF Check-In</h1>
        <p className="text-white/90 text-lg">Powered by ACM</p>
      </div>
      <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 w-full max-w-md border border-white/20">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">Create Account</h2>
          <p className="text-white/80">Sign up with your UF email</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-200 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSignUp} className="space-y-4">
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
              onChange={handlePasswordChange}
              required
              className="w-full bg-white/20 placeholder-white/70 text-white font-semibold py-3 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/50 transition-all duration-200 backdrop-blur-sm border border-white/30"
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={handleConfirmPasswordChange}
              required
              className={`w-full bg-white/20 placeholder-white/70 text-white font-semibold py-3 px-4 rounded-lg focus:outline-none focus:ring-2 transition-all duration-200 backdrop-blur-sm border ${
                passwordError
                  ? "border-red-500 focus:ring-red-500"
                  : "border-white/30 focus:ring-white/50"
              }`}
            />
            {passwordError && (
              <p className="text-red-300 text-sm mt-2">{passwordError}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#FA4616] hover:bg-[#e03d0f] text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Creating Account..." : "Sign Up"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-white/70 text-sm">
            Already have an account?{" "}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                router.push("/");
              }}
              className="text-white font-semibold hover:underline"
            >
              Sign In
            </a>
          </p>
        </div>
      </div>

      <OTPModal
        isOpen={showOTPModal}
        email={email}
        onVerify={handleVerifyOTP}
        onResend={handleResendOTP}
        onClose={handleCloseModal}
        loading={otpLoading}
        error={otpError}
      />
    </div>
  );
}
