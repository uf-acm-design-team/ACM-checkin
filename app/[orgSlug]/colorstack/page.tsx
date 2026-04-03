'use client'

import React, { useState } from "react";

const UFL_EMAIL_REGEX = /^[^\s@]+@ufl\.edu$/;

export default function ColorStackSignIn() {

    const [emailError, setEmailError] = useState("");
    const [email, setEmail] = useState("");

    const validateEmail = (value: string) => {
        if (value && !UFL_EMAIL_REGEX.test(value)) {
            setEmailError("Email must end with @ufl.edu");
            return false;
        } else {
            setEmailError("");
            return true;
        }
    };

    const handleCheckIn = () => {
        if (!validateEmail(email)) {
            return;
        }
        //Continue with checkin logic here
    };

    const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setEmail(e.target.value);
    };

    return (
        <div className="relative flex items-center justify-center min-h-screen bg-[#0b0f24] p-4">
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
                    value={email}
                    onChange={handleEmailChange}
                    className="w-full border-2 border-[#18548f] bg-transparent text-[#18548f] placeholder-[#18548f] font-medium py-4 px-4 rounded-xl mb-6 focus:outline-none"
                />

                {emailError && <p className="text-red-500 mb-4">{emailError}</p>}

                <button
                    onClick={handleCheckIn}
                    className="w-full bg-[#f26f22] cursor-pointer text-white font-bold py-3 px-4 rounded-xl"
                >
                    CHECK IN
                </button>
            </div>
        </div>
    );
}
