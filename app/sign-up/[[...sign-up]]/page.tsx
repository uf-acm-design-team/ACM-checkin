import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10 sm:px-6">
      <div className="mb-6 text-center sm:mb-8">
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Create your account</h1>
        <p className="mt-1 text-sm text-white/80 sm:text-base">Powered by ACM</p>
      </div>
      <div className="w-full max-w-104">
        <SignUp />
      </div>
    </div>
  );
}
