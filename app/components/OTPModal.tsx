"use client";

import { useState, useRef, useEffect } from "react";

interface OTPModalProps {
  isOpen: boolean;
  email: string;
  onVerify: (code: string) => Promise<void>;
  onResend: () => Promise<void>;
  onClose: () => void;
  loading: boolean;
  error: string;
}

export default function OTPModal({
  isOpen,
  email,
  onVerify,
  onResend,
  onClose,
  loading,
  error,
}: OTPModalProps) {
  const [otp, setOtp] = useState(["", "", "", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  useEffect(() => {
    if (isOpen && inputRefs.current[0]) {
      inputRefs.current[0]?.focus();
    }
  }, [isOpen]);

  const handleChange = (index: number, value: string) => {
    // refactor this later to reduce redundancy
    if (value.length > 1) {
      value = value[0];
    }

    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // highlights next empty box
    if (value && index < 7) {
      inputRefs.current[index + 1]?.focus();
    }

    // boxes filled => auto-submit
    if (index === 7 && value) {
      const fullCode = newOtp.join("");
      if (fullCode.length === 8) {
        onVerify(fullCode);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").slice(0, 8);
    if (!/^\d+$/.test(pastedData)) return;

    const newOtp = [...otp];
    for (let i = 0; i < pastedData.length; i++) {
      newOtp[i] = pastedData[i];
    }
    setOtp(newOtp);

    // focus next empty box or last box
    const nextIndex = Math.min(pastedData.length, 7);
    inputRefs.current[nextIndex]?.focus();

    // auto-submit if 8 digits pasted
    if (pastedData.length === 8) {
      onVerify(pastedData);
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    setResendMessage("");
    try {
      await onResend();
      setResendMessage("Code resent! Check your email.");
      setOtp(["", "", "", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } catch (err) {
      setResendMessage("Failed to resend code");
    } finally {
      setResendLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 w-full max-w-lg border border-white/20">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">
            Verify Your Email
          </h2>
          <p className="text-white/80 text-sm">
            We sent an 8-digit code to
            <br />
            <span className="font-semibold">{email}</span>
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-200 text-sm">
            {error}
          </div>
        )}

        {resendMessage && (
          <div className="mb-4 p-3 bg-green-500/20 border border-green-500 rounded-lg text-green-200 text-sm">
            {resendMessage}
          </div>
        )}

        <div className="flex justify-center gap-2 mb-6">
          {otp.map((digit, index) => (
            <input
              key={index}
              ref={(el) => {
                inputRefs.current[index] = el;
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={handlePaste}
              className="w-12 h-14 text-center text-2xl font-bold bg-white/20 text-white rounded-lg border border-white/30 focus:border-white focus:outline-none focus:ring-2 focus:ring-white/50 transition-all"
            />
          ))}
        </div>

        <div className="space-y-3">
          <button
            onClick={() => onVerify(otp.join(""))}
            disabled={loading || otp.join("").length !== 8}
            className="w-full bg-[#FA4616] hover:bg-[#e03d0f] text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Verifying..." : "Verify"}
          </button>

          <div className="text-center">
            <button
              onClick={handleResend}
              disabled={resendLoading}
              className="text-white/70 hover:text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {resendLoading ? "Sending..." : "Resend Code"}
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-full bg-white/10 hover:bg-white/20 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 border border-white/30"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
