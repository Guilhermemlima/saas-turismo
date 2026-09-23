import { z } from "zod";

import { optionalBrazilState, optionalEmail, optionalPhone, optionalText, requiredText } from "@/lib/form-fields";

export const agencyCreateSchema = z.object({
  name: requiredText(2, 120, "Nome da agência"),
  phone_e164: optionalPhone(),
  email: optionalEmail(),
  city: optionalText(120, "Cidade"),
  state: optionalBrazilState(),
});

export type AgencyCreateInput = z.infer<typeof agencyCreateSchema>;
