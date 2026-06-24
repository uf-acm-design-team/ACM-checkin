'use client'

import React from "react";

export default function ColorStackSignIn() {
    return (
        <div className="relative flex items-center justify-center min-h-screen bg-[#0b0f24] p-4">
            {/* Logo positioned in top left */}
            <div className="absolute top-6 left-6 md:top-8 md:left-8">
                <img src="/colorStackLogo.png" alt="ColorStack Logo" className="h-12 md:h-16 w-auto rounded-xl border border-white/20 shadow-sm" />
            </div>

            <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md text-center">
                <h1 className="text-4xl font-extrabold text-[#18548f] mb-2">
                    ColorStack
                </h1>
                <p className="text-gray-500 mb-8 font-medium">
                    Sign In Prototype
                </p>

                <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-6">
                    <p className="text-gray-400 italic">
                        [ Form inputs and auth logic will go here ]
                    </p>
                </div>

                <button
                    className="w-full bg-[#f26f22] text-white font-bold py-3 px-4 rounded-xl"
                >
                    Sign In
                </button>
            </div>
        </div>
    );
}
