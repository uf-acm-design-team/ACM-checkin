"use client";

import { useState } from "react";
import { MobileShell } from "@/components/aed-checkin/mobile-shell";
import {
  EmailPhase,
  RegisterPhase,
  MeetingIdPhase,
  VerifyingPhase,
  VerifiedPhase,
  MismatchPhase,
  QuestionnairePhase,
  CompletePhase,
} from "@/components/aed-checkin/phases";

type Phase =
  | "email"
  | "register"
  | "meeting-id"
  | "verifying"
  | "verified"
  | "mismatch"
  | "questionnaire"
  | "complete";

export default function AedCheckInPage() {
  const [phase, setPhase] = useState<Phase>("email");

  // Simulated global state for the wizard
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [formData, setFormData] = useState<any>({});

  const content: Record<Phase, React.ReactNode> = {
    email: (
      <EmailPhase 
        onNext={(email) => {
          setFormData((prev: any) => ({ ...prev, email }));
          // TODO: Check DB if email exists. For demo, we just go to register.
          setPhase("register");
        }} 
      />
    ),
    register: (
      <RegisterPhase 
        onNext={(data) => {
          setFormData((prev: any) => ({ ...prev, ...data }));
          setPhase("meeting-id");
        }} 
      />
    ),
    "meeting-id": (
      <MeetingIdPhase 
        onNext={(id) => {
          setFormData((prev: any) => ({ ...prev, meetingId: id }));
          setPhase("verifying");
        }} 
      />
    ),
    verifying: (
      <VerifyingPhase 
        onNext={() => setPhase("verified")} 
        onMismatch={() => setPhase("mismatch")} 
      />
    ),
    verified: (
      <VerifiedPhase onNext={() => setPhase("questionnaire")} />
    ),
    mismatch: (
      <MismatchPhase onRetry={() => setPhase("verifying")} />
    ),
    questionnaire: (
      <QuestionnairePhase 
        onNext={(data) => {
          setFormData((prev: any) => ({ ...prev, questionnaire: data }));
          setPhase("complete");
        }} 
      />
    ),
    complete: (
      <CompletePhase details={formData} />
    ),
  };

  return (
    <MobileShell>
      {content[phase]}
    </MobileShell>
  );
}
