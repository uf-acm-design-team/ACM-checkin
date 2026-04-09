"use client";

import React from "react";

export default function ACMCheckIn() {

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-purple-900 p-4">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.1),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(147,51,234,0.1),transparent_40%)]" />

            <div className="absolute top-8 left-8 flex items-center gap-3">
                <img
                    src="/acm-logo.png"
                    alt="ACM Logo"
                    className="h-12 w-auto"
                />
                <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-white/90 font-semibold">
                        Association for Computing Machinery
                    </p>
                    <p className="text-sm font-bold text-white">ACM</p>
                </div>
            </div>

            <div className="relative z-10 w-full max-w-md rounded-3xl border border-slate-700/50 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-xl">
                <h2 className="mb-8 text-center text-2xl font-bold text-white">
                    ACM Attendance
                </h2>

                <input
                    type="email"
                    placeholder="Enter your UFL Email"
                    className="w-full rounded-2xl border border-slate-600 bg-slate-800/50 px-5 py-3 text-white placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />

                <button
                    className="mt-6 w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold uppercase tracking-wider text-white transition duration-200 hover:bg-blue-500"
                >
                    CHECK IN
                </button>
            </div>
        </div>
    );
}