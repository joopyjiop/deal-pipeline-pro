import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "convex/react";
import { ArrowLeft, CheckCircle2, Landmark, Loader2, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

type ExitType = "ASSIGN" | "FLIP" | "BUY_HOLD";

export default function BuyerIntake() {
  const submitBuyer = useAction(api.mongodb.submitBuyer);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    budgetMin: "",
    budgetMax: "",
    targetAreas: "",
    exitType: "ASSIGN" as ExitType,
  });

  const update = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await submitBuyer({
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim().toLowerCase(),
        budgetMin: Number(form.budgetMin),
        budgetMax: Number(form.budgetMax),
        targetAreas: form.targetAreas
          .split(",")
          .map((area) => area.trim())
          .filter(Boolean),
        exitType: form.exitType,
      });
      setSubmitted(true);
      toast.success("Your buyer profile is in the review queue.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit your buyer profile.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen px-5 py-5 text-foreground sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between py-3">
          <Link to="/" className="flex items-center gap-3" aria-label="Deal Pipeline Pro home">
            <span className="flex size-10 items-center justify-center rounded-2xl border border-white/90 bg-white/70 text-emerald-700 shadow-sm backdrop-blur-xl"><Landmark className="size-5" /></span>
            <span className="text-base font-bold tracking-tight text-slate-800">Deal Pipeline Pro</span>
          </Link>
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition-colors hover:text-emerald-700"><ArrowLeft className="size-4" /> Back home</Link>
        </header>

        <section className="grid gap-8 pb-12 pt-12 lg:grid-cols-[0.78fr_1.22fr] lg:items-start lg:pt-20">
          <div>
            <p className="eyebrow">Buyer registry</p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-[-0.04em] text-slate-900 sm:text-5xl">Tell us what you’re ready to buy.</h1>
            <p className="mt-5 max-w-md text-base leading-7 text-slate-600">Share your buy box so the owner can review potential matches against source-backed properties.</p>
            <div className="mt-8 space-y-4">
              <div className="flex gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100/75 text-emerald-700"><ShieldCheck className="size-4" /></div><div><p className="text-sm font-semibold text-slate-800">Review before matching</p><p className="mt-1 text-xs leading-5 text-slate-500">Every public submission stays pending and unverified until the owner reviews it.</p></div></div>
              <div className="flex gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100/75 text-emerald-700"><CheckCircle2 className="size-4" /></div><div><p className="text-sm font-semibold text-slate-800">No automatic promises</p><p className="mt-1 text-xs leading-5 text-slate-500">A submission is an intake signal, not proof of funds or a guaranteed deal match.</p></div></div>
            </div>
          </div>

          <div className="glass-panel-strong rounded-[2rem] p-5 sm:p-8">
            {submitted ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center px-5 text-center">
                <div className="flex size-16 items-center justify-center rounded-3xl bg-emerald-100/80 text-emerald-700"><CheckCircle2 className="size-8" /></div>
                <p className="eyebrow mt-6">Pending review</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Your buyer profile is queued.</h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">The owner will review your details before approving your profile for any future matching.</p>
                <Link to="/" className="mt-7 inline-flex rounded-full bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-800">Return to Deal Pipeline Pro</Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="grid gap-5">
                <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Contact</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><Input required value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Full name" className="rounded-xl border-white/85 bg-white/65" /><Input required type="email" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="Email address" className="rounded-xl border-white/85 bg-white/65" /><Input required type="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="Phone number" className="rounded-xl border-white/85 bg-white/65 sm:col-span-2" /></div></div>
                <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Your buy box</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><Input required type="number" min="0" value={form.budgetMin} onChange={(event) => update("budgetMin", event.target.value)} placeholder="Minimum purchase budget" className="rounded-xl border-white/85 bg-white/65" /><Input required type="number" min="0" value={form.budgetMax} onChange={(event) => update("budgetMax", event.target.value)} placeholder="Maximum purchase budget" className="rounded-xl border-white/85 bg-white/65" /><Input required value={form.targetAreas} onChange={(event) => update("targetAreas", event.target.value)} placeholder="Target areas, separated by commas" className="rounded-xl border-white/85 bg-white/65 sm:col-span-2" /><label className="grid gap-1.5 text-xs font-semibold text-slate-600 sm:col-span-2"><span>Exit strategy</span><select value={form.exitType} onChange={(event) => update("exitType", event.target.value)} className="h-10 rounded-xl border border-white/85 bg-white/70 px-3 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/30"><option value="ASSIGN">Assign the contract</option><option value="FLIP">Fix and flip</option><option value="BUY_HOLD">Buy and hold</option></select></label></div></div>
                <div className="rounded-2xl border border-emerald-100/80 bg-emerald-50/55 p-4 text-xs leading-5 text-slate-600">By submitting, you’re asking to be considered as a buyer. Your profile will remain <strong className="text-slate-800">pending + unverified</strong> until the owner reviews it.</div>
                <Button type="submit" disabled={isSubmitting} className="h-11 rounded-xl bg-emerald-700 text-sm font-semibold hover:bg-emerald-800">{isSubmitting ? <><Loader2 className="size-4 animate-spin" /> Submitting</> : "Submit buyer profile"}</Button>
              </form>
            )}
          </div>
        </section>
        <p className="pb-5 text-center text-xs text-slate-500">Not legal advice. Your information is used for buyer intake review and matching decisions.</p>
      </div>
    </main>
  );
}
