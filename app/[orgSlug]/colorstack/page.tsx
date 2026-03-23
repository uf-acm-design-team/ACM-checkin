'use client'

import React from "react";

export default function ColorStackSignIn() {
    return (
        <div className="relative flex items-center justify-center min-h-screen bg-[#0b0f24] p-4">
            {/* Logo and name positioned in top right */}
            <div className="absolute top-4 right-4 md:top-6 md:right-6 flex items-center gap-3">
                <img src="/colorStackLogo.png" alt="ColorStack Logo" className="h-12 md:h-16 w-auto rounded-xl border border-white/20 shadow-sm" />
                <span className="text-white font-bold text-lg md:text-xl" style={{ color: '#f26f22' }}>ColorStack</span>
            </div>

            <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md text-center">
                <h1 className="text-2xl font-extrabold text-[#18548f] mb-8">
                    ColorStack Attendance
                </h1>

                <input
                    type="email"
                    placeholder="Enter Your UFL Email"
                    className="w-full border-2 border-[#18548f] bg-transparent text-[#18548f] placeholder-[#18548f] font-medium py-4 px-4 rounded-xl mb-6 focus:outline-none"
                />

                <button
                    className="w-full bg-[#f26f22] text-white font-bold py-3 px-4 rounded-xl"
                >
                    CHECK IN
                </button>
            </div>
        </div>
    );
}
