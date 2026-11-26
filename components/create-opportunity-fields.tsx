"use client";

import { useState } from "react";
import { Field } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

type Opt = { id: string; name: string };

/** Fields of "Create opportunity": existing or new brand, existing, new or no contact (SPEC §4.4). */
export function CreateOpportunityFields({
  brands,
  contacts,
  campaigns,
  owners,
  industries,
}: {
  brands: Opt[];
  contacts: (Opt & { brand_id: string; title: string | null })[];
  campaigns: Opt[];
  owners: Opt[];
  industries: string[];
}) {
  const [brandMode, setBrandMode] = useState<"existing" | "new">("existing");
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [contactMode, setContactMode] = useState<"none" | "existing" | "new">("none");
  const brandContacts = contacts.filter((c) => c.brand_id === brandId);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Brand">
        <NativeSelect name="brand_mode" value={brandMode} onChange={(e) => setBrandMode(e.target.value as "existing" | "new")} className="w-full" aria-label="Brand mode">
          <NativeSelectOption value="existing">Existing brand</NativeSelectOption>
          <NativeSelectOption value="new">New brand</NativeSelectOption>
        </NativeSelect>
      </Field>
      {brandMode === "existing" ? (
        <Field label="Existing brand">
          <NativeSelect name="brand_id" value={brandId} onChange={(e) => setBrandId(e.target.value)} className="w-full" aria-label="Existing brand">
            {brands.map((b) => (
              <NativeSelectOption key={b.id} value={b.id}>
                {b.name} ({b.id})
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      ) : (
        <>
          <Field label="New brand name">
            <Input name="new_brand_name" required aria-label="New brand name" />
          </Field>
          <Field label="Industry">
            <NativeSelect name="new_brand_industry" className="w-full" aria-label="Industry">
              {industries.map((i) => (
                <NativeSelectOption key={i} value={i}>
                  {i}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </>
      )}
      <Field label="Primary contact" className="sm:col-start-1">
        <NativeSelect name="contact_mode" value={contactMode} onChange={(e) => setContactMode(e.target.value as "none" | "existing" | "new")} className="w-full" aria-label="Contact mode">
          <NativeSelectOption value="none">No contact</NativeSelectOption>
          {brandMode === "existing" && <NativeSelectOption value="existing">Existing contact</NativeSelectOption>}
          <NativeSelectOption value="new">New contact</NativeSelectOption>
        </NativeSelect>
      </Field>
      {contactMode === "existing" && brandMode === "existing" && (
        <Field label="Existing contact">
          <NativeSelect name="contact_id" className="w-full" aria-label="Existing contact">
            {brandContacts.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.name}
                {c.title ? `, ${c.title}` : ""}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      )}
      {contactMode === "new" && (
        <>
          <Field label="Contact name">
            <Input name="new_contact_name" required aria-label="Contact name" />
          </Field>
          <Field label="Job title">
            <Input name="new_contact_title" aria-label="Job title" />
          </Field>
        </>
      )}
      <Field label="Opportunity name" hint="Default: <brand> festival partnership" className="sm:col-span-2">
        <Input name="opportunity_name" aria-label="Opportunity name" />
      </Field>
      <Field label="Originating campaign">
        <NativeSelect name="sponsor_campaign_id" className="w-full" aria-label="Originating campaign">
          {campaigns.map((c) => (
            <NativeSelectOption key={c.id} value={c.id}>
              {c.name} ({c.id})
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Owner">
        <NativeSelect name="owner_id" className="w-full" aria-label="Owner">
          {owners.map((o) => (
            <NativeSelectOption key={o.id} value={o.id}>
              {o.name} ({o.id})
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Support type">
        <NativeSelect name="support_type" className="w-full" aria-label="Support type">
          <NativeSelectOption value="cash">Cash</NativeSelectOption>
          <NativeSelectOption value="in_kind">In kind</NativeSelectOption>
        </NativeSelect>
      </Field>
      <Field label="Stage" hint="New opportunities start in an open stage">
        <NativeSelect name="stage" className="w-full" aria-label="Stage">
          {["prospecting", "contacted", "proposal_sent", "negotiating"].map((s) => (
            <NativeSelectOption key={s} value={s}>
              {s}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Proposed value (₹)">
        <Input name="proposed_value_inr" inputMode="numeric" required aria-label="Proposed value" />
      </Field>
    </div>
  );
}
