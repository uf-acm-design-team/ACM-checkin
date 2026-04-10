'use client'

import { createClient } from "@/app/utils/supabase/client";
import React, { useState } from "react";

const UFL_EMAIL_REGEX = /^[^\s@]+@ufl\.edu$/;

export default function ColorStackSignIn() {

    const [checkinMessage, setCheckinMessage] = useState("");
    const [success, setSuccess] = useState("");
    const [email, setEmail] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [gradYear, setGradYear] = useState("");
    const supabase = createClient();
    const [loading, setLoading] = useState(false);
    const [signUp, setSignUp] = useState(false);

    const validateEmail = (value: string) => {
        if (value && !UFL_EMAIL_REGEX.test(value)) {
            setCheckinMessage("Email must end with @ufl.edu");
            return false;
        } else {
            setCheckinMessage("");
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
            setCheckinMessage("Error while checking in. Please try again.");
            setLoading(false);
            return;
        }
        if(orgId == null){
            setCheckinMessage("ColorStack not initialized in backend!");
            setLoading(false);
            return;
        }
        setCheckinMessage("");
        const { data: activeMeeting, error: activeMeetingError } = await supabase
            .from("meetings")
            .select("id, org_id")
            .eq("org_id", orgId.id)
            .eq("status", true)
            .limit(1)
            .maybeSingle();
        if(activeMeetingError != null){
            setCheckinMessage("Error while checking in. Please try again.");
            setLoading(false);
            return;
        }
        if(activeMeeting == null){
            setCheckinMessage("There is currently no active meeting!");
            setLoading(false);
            return;
        }
        setCheckinMessage("");
        const { data: attendeeExistence, error: attendeeExistenceError } = await supabase
            .from("attendee")
            .select("id")
            .eq("email", email)
            .maybeSingle();
        if(attendeeExistenceError != null){
            setCheckinMessage("Error while checking in. Please try again.");
            setLoading(false);
            return;
        }
        if(attendeeExistence == null){
            setSignUp(true);
            setLoading(false);
            return;
        }
        const { data: checkedIn, error: checkedInError } = await supabase
            .from("attendance")
            .select("id")
            .eq("meeting_id", activeMeeting.id)
            .eq("attendee_id", attendeeExistence.id)
            .maybeSingle();
        if(checkedIn != null){
            setCheckinMessage("You are already checked in!");
        } else {
            setCheckinMessage("");
            const { data: inserted, error: insertionError } = await supabase
                .from("attendance")
                .insert({ org_id: orgId.id, meeting_id: activeMeeting.id, attendee_id: attendeeExistence.id, source: "guest"});
            if(insertionError != null){
                setCheckinMessage("Error while checking in. Please try again.");
            } else {
                setCheckinMessage("");
                setSuccess("Successfully checked in!");
            }
        }
        setLoading(false);
    };

    const handleSignUp = async () => {
        setSuccess("");
        setCheckinMessage("");
        setLoading(true);

        if (!firstName || !lastName || !gradYear) {
            setCheckinMessage("Please enter your first name, last name, and graduation year.");
            setLoading(false);
            return;
        }

        const {data: attendeeInsertion, error: attendeeInsertionError} = await supabase
            .from("attendee")
            .insert({email: email, first_name: firstName, last_name: lastName, grad_year: gradYear});

        if(attendeeInsertionError != null){
            setCheckinMessage("Error while signing up. Please try again.");
            setLoading(false);
            return;
        }

        setSignUp(false);
        await handleCheckIn();
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

                {checkinMessage && <p className="text-red-500 mb-4">{checkinMessage}</p>}
                {success && <p className="text-green-500 mb-4">{success}</p>}

                {signUp ? (
                    <>
                        <input
                            type="text"
                            placeholder="First Name"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            className="w-full border-2 border-[#18548f] bg-transparent text-[#18548f] placeholder-[#18548f] font-medium py-4 px-4 rounded-xl mb-4 focus:outline-none"
                        />
                        <input
                            type="text"
                            placeholder="Last Name"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            className="w-full border-2 border-[#18548f] bg-transparent text-[#18548f] placeholder-[#18548f] font-medium py-4 px-4 rounded-xl mb-4 focus:outline-none"
                        />
                        <input
                            type="text"
                            placeholder="Graduation Year"
                            value={gradYear}
                            onChange={(e) => setGradYear(e.target.value)}
                            className="w-full border-2 border-[#18548f] bg-transparent text-[#18548f] placeholder-[#18548f] font-medium py-4 px-4 rounded-xl mb-6 focus:outline-none"
                        />
                        <button
                            onClick={() => handleSignUp()}
                            disabled={loading}
                            className="w-full bg-[#18548f] cursor-pointer text-white font-bold py-3 px-4 rounded-xl"
                        >
                            {loading ? "SIGNING UP..." : "SIGN UP"}
                        </button>
                    </>
                ) : (
                    <button
                        onClick={handleCheckIn}
                        disabled={loading}
                        className="w-full bg-[#f26f22] cursor-pointer text-white font-bold py-3 px-4 rounded-xl"
                    >
                        {loading ? "CHECKING IN..." : "CHECK IN"}
                    </button>
                )}
            </div>
        </div>
    );
}
