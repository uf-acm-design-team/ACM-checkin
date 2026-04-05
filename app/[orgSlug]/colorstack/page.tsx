'use client'

import { createClient } from "@/app/utils/supabase/client";
import React, { useState } from "react";

const UFL_EMAIL_REGEX = /^[^\s@]+@ufl\.edu$/;

export default function ColorStackSignIn() {

    const [emailError, setEmailError] = useState("");
    const [email, setEmail] = useState("");
    const supabase = createClient();
    const [colorStackError, setColorStackError] = useState("");
    const [meetingError, setMeetingError] = useState("");
    const [alreadyCheckedIn, setAlreadyCheckedIn] = useState("");
    const [success, setSuccess] = useState("");
    const [registered, setRegistered] = useState("");
    const [loading, setLoading] = useState(false);
    const [insertError, setInsertError] = useState("");

    const validateEmail = (value: string) => {
        if (value && !UFL_EMAIL_REGEX.test(value)) {
            setEmailError("Email must end with @ufl.edu");
            return false;
        } else {
            setEmailError("");
            return true;
        }
    };

    const handleCheckIn = async () => {
        setSuccess("");
        setLoading(true);
        if (!validateEmail(email)) {
            setLoading(false);
            return;
        }
        const { data: orgId, error: orgError } = await supabase
            .from("organizations")
            .select("id")
            .eq("slug", "colorstack")
            .single();
        if(orgError != null){
            setColorStackError("ColorStack not initialized in backend!");
            setLoading(false);
            return;
        }
        setColorStackError("");
        const { data: activeMeeting, error: activeMeetingError } = await supabase
            .from("meetings")
            .select("id, org_id")
            .eq("org_id", orgId.id)
            .eq("status", true)
            .limit(1)
            .maybeSingle();
        if(activeMeetingError != null || activeMeeting == null){
            setMeetingError("There is currently no active meeting!");
            setLoading(false);
            return;
        }
        setMeetingError("");
        const { data: attendeeExistence, error: attendeeExistenceError } = await supabase
            .from("attendee")
            .select("id")
            .eq("email", email)
            .maybeSingle();
        if(attendeeExistence == null || attendeeExistenceError != null){
            setRegistered("You must register on the main page before checking in.");
            setLoading(false);
            return;
        }
        setRegistered("");
        const { data: checkedIn, error: checkedInError } = await supabase
            .from("attendance")
            .select("id")
            .eq("meeting_id", activeMeeting.id)
            .eq("attendee_id", attendeeExistence.id)
            .maybeSingle();
        if(checkedIn != null){
            setAlreadyCheckedIn("You are already checked in!");
        } else {
            setAlreadyCheckedIn("");
            const { data: inserted, error: insertionError } = await supabase
                .from("attendance")
                .insert({ org_id: orgId.id, meeting_id: activeMeeting.id, attendee_id: attendeeExistence.id, source: "guest"});
            if(insertionError != null){
                setInsertError("Error in checking in. Please try again.");
            } else {
                setInsertError("");
                setSuccess("Successfully checked in!");
            }
        }
        setLoading(false);
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
                {colorStackError && <p className="text-red-500 mb-4">{colorStackError}</p>}
                {alreadyCheckedIn && <p className="text-red-500 mb-4">{alreadyCheckedIn}</p>}
                {meetingError && <p className="text-red-500 mb-4">{meetingError}</p>}
                {registered && <p className="text-red-500 mb-4">{registered}</p>}
                {insertError && <p className="text-red-500 mb-4">{insertError}</p>}
                {success && <p className="text-green-500 mb-4">{success}</p>}

                <button
                    onClick={handleCheckIn}
                    disabled={loading}
                    className="w-full bg-[#f26f22] cursor-pointer text-white font-bold py-3 px-4 rounded-xl"
                >
                    {loading ? "CHECKING IN..." : "CHECK IN"}
                </button>
            </div>
        </div>
    );
}
